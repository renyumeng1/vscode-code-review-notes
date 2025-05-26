import * as vscode from 'vscode';
import * as path from 'path';
import { Comment, CommentReply } from './types';
import { CommentService } from './commentService';

/**
 * 树视图项类型
 */
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
            this.description = this.getCommentDescription(comment);
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
    }
      private getCommentDescription(comment: Comment): string {
        const fileUri = vscode.Uri.parse(comment.documentUri);
        const fileName = path.basename(fileUri.fsPath);
        const lineNumber = comment.range.startLine + 1;
        let status = '';
        if (comment.resolved) {
            status = comment.resolvedBy ? ` (已解决 by ${comment.resolvedBy})` : ' (已解决)';
        }
        return `${fileName}:${lineNumber}${status}`;
    }
      private getCommentTooltip(comment: Comment): string {
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

/**
 * 评论树数据提供者
 */
export class CommentTreeDataProvider implements vscode.TreeDataProvider<CommentTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<CommentTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private commentService: CommentService) {
        // 监听评论数据变化
        this.commentService.onDidChangeComments(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: CommentTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommentTreeItem): Thenable<CommentTreeItem[]> {
        if (!element) {
            // 根级别：显示当前文件的评论
            return this.getCurrentFileComments();
        } else if (element.comment && !element.isReply) {
            // 评论级别：显示回复
            return this.getCommentReplies(element.comment);
        } else {
            // 回复级别：没有子项
            return Promise.resolve([]);
        }
    }

    private async getCurrentFileComments(): Promise<CommentTreeItem[]> {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return [];
        }

        const documentUri = activeEditor.document.uri.toString();
        const comments = this.commentService.getCommentsForFile(documentUri);
        
        // 按行号排序
        comments.sort((a, b) => a.range.startLine - b.range.startLine);

        return comments.map(comment => {
            const hasReplies = comment.replies.length > 0;
            const collapsibleState = hasReplies 
                ? vscode.TreeItemCollapsibleState.Collapsed 
                : vscode.TreeItemCollapsibleState.None;
                
            const truncatedText = this.truncateText(comment.text, 50);
            const label = `${truncatedText}`;
            
            return new CommentTreeItem(label, collapsibleState, comment);
        });
    }

    private async getCommentReplies(comment: Comment): Promise<CommentTreeItem[]> {
        return comment.replies.map(reply => {
            const truncatedText = this.truncateText(reply.text, 40);
            return new CommentTreeItem(
                truncatedText,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                reply,
                true
            );
        });
    }

    private truncateText(text: string, maxLength: number): string {
        if (text.length <= maxLength) {
            return text;
        }
        return text.substring(0, maxLength - 3) + '...';
    }
}
