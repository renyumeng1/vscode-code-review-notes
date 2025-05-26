import * as vscode from 'vscode';
import { Comment, CommentReply, CommentRange, CommentData } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * 评论服务类，负责管理评论数据的CRUD操作
 */
export class CommentService {
    private static readonly STORAGE_KEY = 'codeReviewNotes.comments';
    private static readonly DATA_VERSION = '1.0.0';
    
    private comments: Comment[] = [];
    private context: vscode.ExtensionContext;
    private _onDidChangeComments = new vscode.EventEmitter<void>();
    
    readonly onDidChangeComments = this._onDidChangeComments.event;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadComments();
    }

    /**
     * 获取当前文件的所有评论
     */
    getCommentsForFile(documentUri: string): Comment[] {
        return this.comments.filter(comment => comment.documentUri === documentUri);
    }

    /**
     * 获取所有评论
     */
    getAllComments(): Comment[] {
        return this.comments;
    }

    /**
     * 根据ID获取评论
     */
    getCommentById(id: string): Comment | undefined {
        return this.comments.find(comment => comment.id === id);
    }

    /**
     * 添加新评论
     */
    addComment(
        documentUri: string,
        range: CommentRange,
        text: string,
        author: string = 'User'
    ): Comment {
        const comment: Comment = {
            id: uuidv4(),
            documentUri,
            range,
            text,
            author,
            timestamp: Date.now(),
            resolved: false,
            replies: []
        };

        this.comments.push(comment);
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return comment;
    }

    /**
     * 添加回复
     */
    addReply(commentId: string, text: string, author: string = 'User'): CommentReply | undefined {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return undefined;
        }

        const reply: CommentReply = {
            id: uuidv4(),
            parentId: commentId,
            author,
            text,
            timestamp: Date.now()
        };

        comment.replies.push(reply);
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return reply;
    }    /**
     * 解决评论
     */
    resolveComment(commentId: string, resolvedBy?: string): boolean {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return false;
        }

        comment.resolved = true;
        comment.resolvedBy = resolvedBy;
        comment.resolvedAt = Date.now();
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return true;
    }

    /**
     * 取消解决评论
     */
    unresolveComment(commentId: string): boolean {
        const comment = this.getCommentById(commentId);
        if (!comment) {
            return false;
        }

        comment.resolved = false;
        // 保留resolvedBy和resolvedAt，以便查看历史记录
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return true;
    }

    /**
     * 删除评论
     */
    deleteComment(commentId: string): boolean {
        const index = this.comments.findIndex(comment => comment.id === commentId);
        if (index === -1) {
            return false;
        }

        this.comments.splice(index, 1);
        this.saveComments();
        this._onDidChangeComments.fire();
        
        return true;
    }

    /**
     * 从持久化存储加载评论
     */
    private loadComments(): void {
        try {
            const data = this.context.workspaceState.get<CommentData>(CommentService.STORAGE_KEY);
            if (data && data.comments) {
                this.comments = data.comments;
            }
        } catch (error) {
            console.error('Failed to load comments:', error);
            this.comments = [];
        }
    }

    /**
     * 保存评论到持久化存储
     */
    private saveComments(): void {
        try {
            const data: CommentData = {
                comments: this.comments,
                version: CommentService.DATA_VERSION
            };
            this.context.workspaceState.update(CommentService.STORAGE_KEY, data);
        } catch (error) {
            console.error('Failed to save comments:', error);
        }
    }

    /**
     * 清除所有评论（用于测试或重置）
     */
    clearAllComments(): void {
        this.comments = [];
        this.saveComments();
        this._onDidChangeComments.fire();
    }

    /**
     * 获取当前用户名
     */
    getCurrentUser(): string {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        return config.get<string>('defaultAuthor') || 'User';
    }

    /**
     * 设置当前用户名
     */
    async setCurrentUser(username: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        await config.update('defaultAuthor', username, vscode.ConfigurationTarget.Workspace);
    }

    /**
     * 提示用户输入用户名
     */
    async promptForUsername(): Promise<string | undefined> {
        const currentUser = this.getCurrentUser();
        const username = await vscode.window.showInputBox({
            prompt: '请输入您的用户名',
            value: currentUser,
            placeHolder: '例如：张三',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '用户名不能为空';
                }
                if (value.trim().length > 50) {
                    return '用户名不能超过50个字符';
                }
                return null;
            }
        });

        if (username && username.trim() !== currentUser) {
            await this.setCurrentUser(username.trim());
            vscode.window.showInformationMessage(`用户名已更新为：${username.trim()}`);
        }

        return username?.trim();
    }
}
