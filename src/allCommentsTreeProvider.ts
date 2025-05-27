import * as vscode from 'vscode';
import * as path from 'path';
import { Comment, CommentReply } from './types';
import { CommentService } from './commentService';

/**
 * 评论过滤类型
 */
export enum CommentFilter {
    All = 'all',
    Resolved = 'resolved',
    Unresolved = 'unresolved'
}

/**
 * 文件节点，用于组织评论
 */
export class FileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string,
        public readonly commentCount: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.contextValue = 'file';
        this.description = `${commentCount} comment${commentCount !== 1 ? 's' : ''}`;
        this.tooltip = `${filePath}\n${commentCount} comment${commentCount !== 1 ? 's' : ''}`;
        this.iconPath = vscode.ThemeIcon.File;
        
        // 设置点击命令
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.parse(filePath)]
        };
    }
}

/**
 * 全局评论树数据提供者
 */
export class AllCommentsTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private currentFilter: CommentFilter = CommentFilter.All;

    constructor(private commentService: CommentService) {
        // 监听评论数据变化
        this.commentService.onDidChangeComments(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    setFilter(filter: CommentFilter): void {
        this.currentFilter = filter;
        this.refresh();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // 根级别：显示文件组
            return this.getFileGroups();
        } else if (element instanceof FileTreeItem) {
            // 文件级别：显示该文件的评论
            return this.getFileComments(element.filePath);
        } else {
            // 评论级别：显示回复
            const commentTreeItem = element as any;
            if (commentTreeItem.comment && !commentTreeItem.isReply) {
                return this.getCommentReplies(commentTreeItem.comment);
            }
            return Promise.resolve([]);
        }
    }

    private async getFileGroups(): Promise<FileTreeItem[]> {
        const allComments = this.commentService.getAllComments();
        const filteredComments = this.filterComments(allComments);
        
        // 按文件分组
        const fileGroups = new Map<string, Comment[]>();
        
        filteredComments.forEach(comment => {
            const uri = comment.documentUri;
            if (!fileGroups.has(uri)) {
                fileGroups.set(uri, []);
            }
            fileGroups.get(uri)!.push(comment);
        });

        // 创建文件树项
        const fileItems: FileTreeItem[] = [];
        
        for (const [uri, comments] of fileGroups) {
            try {
                const parsedUri = vscode.Uri.parse(uri);
                const fileName = path.basename(parsedUri.fsPath);
                const relativePath = vscode.workspace.asRelativePath(parsedUri);
                
                const fileItem = new FileTreeItem(
                    fileName,
                    uri,
                    comments.length,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                
                fileItem.description = `${relativePath} • ${comments.length} comment${comments.length !== 1 ? 's' : ''}`;
                fileItems.push(fileItem);
            } catch (error) {
                console.error('Error parsing URI:', uri, error);
            }
        }

        // 按文件名排序
        fileItems.sort((a, b) => a.label.localeCompare(b.label));
        
        return fileItems;
    }    private async getFileComments(documentUri: string): Promise<vscode.TreeItem[]> {
        const comments = this.commentService.getCommentsForFile(documentUri);
        const filteredComments = this.filterComments(comments);
        
        // 按行号排序，使用锚点系统
        filteredComments.sort((a, b) => {
            const rangeA = this.commentService.getCommentRange(a);
            const rangeB = this.commentService.getCommentRange(b);
            return rangeA.startLine - rangeB.startLine;
        });        return filteredComments.map(comment => {
            const hasReplies = comment.replies.length > 0;
            const collapsibleState = hasReplies 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None;
                
            const truncatedText = this.truncateText(comment.text, 60);
            const range = this.commentService.getCommentRange(comment);
            const lineNumber = range.startLine + 1;
            const label = `Line ${lineNumber}: ${truncatedText}`;
            
            const item = new CommentTreeItem(label, collapsibleState, comment);
            // 设置描述
            const date = new Date(comment.timestamp).toLocaleString('zh-CN', { 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            let status = '';
            if (comment.resolved) {
                status = comment.resolvedBy ? ` (已解决 by ${comment.resolvedBy})` : ' (已解决)';
            }
            item.description = `${comment.author} - ${date}${status}`;
            return item;
        });
    }

    private async getCommentReplies(comment: Comment): Promise<vscode.TreeItem[]> {
        return comment.replies.map(reply => {
            const truncatedText = this.truncateText(reply.text, 50);
            return new CommentTreeItem(
                truncatedText,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                reply,
                true
            );
        });
    }

    private filterComments(comments: Comment[]): Comment[] {
        switch (this.currentFilter) {
            case CommentFilter.Resolved:
                return comments.filter(comment => comment.resolved);
            case CommentFilter.Unresolved:
                return comments.filter(comment => !comment.resolved);
            case CommentFilter.All:
            default:
                return comments;
        }
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }

    getCurrentFilterDescription(): string {
        switch (this.currentFilter) {
            case CommentFilter.Resolved:
                return 'Showing resolved comments';
            case CommentFilter.Unresolved:
                return 'Showing unresolved comments';
            case CommentFilter.All:
            default:
                return 'Showing all comments';
        }
    }
}

// 重用现有的CommentTreeItem类
export class CommentTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly comment?: Comment,
        public readonly reply?: CommentReply,
        public readonly isReply: boolean = false
    ) {
        super(label, collapsibleState);
          if (comment && !isReply) {
            this.contextValue = comment.resolved ? 'resolvedComment' : 'comment';
            this.tooltip = this.getCommentTooltip(comment);
            this.iconPath = comment.resolved 
                ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
                : new vscode.ThemeIcon('comment');
                
            // 设置点击命令
            this.command = {
                command: 'code-review-notes.goToComment',
                title: 'Go to Comment',
                arguments: [comment.id]
            };
        } else if (reply && isReply) {
            this.contextValue = 'reply';
            this.description = this.getReplyDescription(reply);
            this.tooltip = this.getReplyTooltip(reply);
            this.iconPath = new vscode.ThemeIcon('arrow-right');
        }
    }    private getCommentTooltip(comment: Comment): string {
        const date = new Date(comment.timestamp).toLocaleString();
        const repliesCount = comment.replies.length;
        const repliesText = repliesCount > 0 ? ` (${repliesCount} 个回复)` : '';
        
        let tooltip = `作者: ${comment.author}\n时间: ${date}\n内容: ${comment.text}${repliesText}`;
        
        if (comment.resolved && comment.resolvedBy) {
            const resolvedDate = comment.resolvedAt ? new Date(comment.resolvedAt).toLocaleString() : '';
            tooltip += `\n解决者: ${comment.resolvedBy}${resolvedDate ? `\n解决时间: ${resolvedDate}` : ''}`;
        }
        
        return tooltip;
    }
    
    private getReplyDescription(reply: CommentReply): string {
        const date = new Date(reply.timestamp).toLocaleString('zh-CN', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        return `${reply.author} - ${date}`;
    }
    
    private getReplyTooltip(reply: CommentReply): string {
        const date = new Date(reply.timestamp).toLocaleString();
        return `回复者: ${reply.author}\n时间: ${date}\n内容: ${reply.text}`;
    }
}
