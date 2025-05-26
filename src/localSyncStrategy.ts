import * as vscode from 'vscode';
import { Comment } from './types';
import { SyncStrategy, SyncMethod, SyncResult } from './syncStrategy';

/**
 * 本地同步策略 - 仅在本地存储，不同步到外部
 */
export class LocalSyncStrategy extends SyncStrategy {
    private static readonly STORAGE_KEY = 'codeReviewNotes.comments';

    getSyncMethod(): SyncMethod {
        return SyncMethod.Local;
    }

    async isSupported(): Promise<boolean> {
        // 本地同步总是支持的
        return true;
    }

    async saveComments(comments: Comment[]): Promise<SyncResult> {
        try {
            // 转换为相对路径格式存储
            const portableComments = comments.map(comment => ({
                ...comment,
                documentUri: this.toRelativePath(comment.documentUri)
            }));

            const data = {
                comments: portableComments,
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                syncMethod: SyncMethod.Local
            };

            await this.context.workspaceState.update(LocalSyncStrategy.STORAGE_KEY, data);

            return {
                success: true,
                message: `💾 本地保存成功 (${comments.length} 条评论)`,
                comments: comments
            };
        } catch (error) {
            return {
                success: false,
                message: `本地保存失败: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async loadComments(): Promise<Comment[]> {
        try {
            const data = this.context.workspaceState.get<any>(LocalSyncStrategy.STORAGE_KEY);
            if (!data || !data.comments) {
                return [];
            }

            // 转换相对路径回绝对路径
            const absoluteComments = data.comments.map((comment: any) => ({
                ...comment,
                documentUri: this.toAbsolutePath(comment.documentUri),
                replies: comment.replies || []
            }));

            return absoluteComments;
        } catch (error) {
            console.error('Failed to load comments from local storage:', error);
            return [];
        }
    }

    async performFullSync(localComments: Comment[]): Promise<Comment[]> {
        // 本地同步不需要合并，直接保存并返回
        const result = await this.saveComments(localComments);
        if (result.success) {
            vscode.window.showInformationMessage('📱 本地同步完成');
            return localComments;
        } else {
            throw new Error(result.message);
        }
    }

    async getSyncStatus(): Promise<string> {
        try {
            const data = this.context.workspaceState.get<any>(LocalSyncStrategy.STORAGE_KEY);
            if (!data || !data.lastUpdated) {
                return '本地: 未同步';
            }

            const lastUpdated = new Date(data.lastUpdated);
            const now = new Date();
            const diffMs = now.getTime() - lastUpdated.getTime();
            const diffMins = Math.floor(diffMs / (1000 * 60));

            if (diffMins < 1) {
                return '本地: 刚刚更新';
            } else if (diffMins < 60) {
                return `本地: ${diffMins}分钟前更新`;
            } else {
                const diffHours = Math.floor(diffMins / 60);
                return `本地: ${diffHours}小时前更新`;
            }
        } catch {
            return '本地: 状态未知';
        }
    }
}
