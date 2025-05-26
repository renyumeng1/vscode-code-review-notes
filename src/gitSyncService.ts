import * as vscode from 'vscode';
import { Comment } from './types';
import { SyncStrategy, SyncMethod, SyncResult, SyncMetadata } from './syncStrategy';

/**
 * Git同步策略 - 通过Git仓库同步评论
 */
export class GitSyncStrategy extends SyncStrategy {
    private readonly COMMENTS_FILE_NAME = 'code-review-comments.json';

    getSyncMethod(): SyncMethod {
        return SyncMethod.Git;
    }

    async isSupported(): Promise<boolean> {
        // 检查是否在Git工作区中
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        try {
            // 检查是否存在.git目录
            const gitDir = vscode.Uri.joinPath(workspaceFolder.uri, '.git');
            await vscode.workspace.fs.stat(gitDir);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取评论文件的完整路径
     */
    private getCommentsFilePath(): vscode.Uri | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }

        return vscode.Uri.joinPath(
            workspaceFolder.uri, 
            '.vscode', 
            this.COMMENTS_FILE_NAME
        );
    }

    /**
     * 检查是否启用了Git同步
     */
    private isGitSyncEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        return config.get<boolean>('gitSyncEnabled', true);
    }    /**
     * 获取当前用户名
     */
    protected getCurrentUser(): string {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        return config.get<string>('defaultAuthor', 'User');
    }async saveComments(comments: Comment[]): Promise<SyncResult> {
        try {
            await this.saveCommentsToFile(comments);
            return {
                success: true,
                message: `📤 Git同步成功 (${comments.length} 条评论)`,
                comments: comments
            };
        } catch (error) {
            return {
                success: false,
                message: `Git同步失败: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }

    async loadComments(): Promise<Comment[]> {
        return await this.loadCommentsFromFile();
    }

    async getSyncStatus(): Promise<string> {
        return await this.getGitStatus();
    }

    /**
     * 将评论保存到Git可跟踪的文件
     */
    async saveCommentsToFile(comments: Comment[]): Promise<void> {
        if (!this.isGitSyncEnabled()) {
            return;
        }

        const filePath = this.getCommentsFilePath();
        if (!filePath) {
            throw new Error('No workspace folder found');
        }

        try {
            // 确保.vscode目录存在
            const vscodeDir = vscode.Uri.joinPath(filePath, '..');
            await vscode.workspace.fs.createDirectory(vscodeDir);

            // 转换评论为相对路径格式（便于跨设备同步）
            const portableComments = comments.map(comment => ({
                ...comment,
                documentUri: this.toRelativePath(comment.documentUri),
                replies: comment.replies?.map(reply => ({
                    ...reply,
                    // 保持回复的原始格式
                })) || []
            }));            const syncData: SyncMetadata = {
                version: '1.0.0',
                generatedBy: 'Code Review Notes Extension',
                lastUpdated: new Date().toISOString(),
                syncedBy: this.getCurrentUser(),
                syncMethod: SyncMethod.Git,
                comments: portableComments
            };

            const content = new TextEncoder().encode(
                JSON.stringify(syncData, null, 2)
            );

            await vscode.workspace.fs.writeFile(filePath, content);

            vscode.window.showInformationMessage(
                `💾 Comments synced to ${this.COMMENTS_FILE_NAME} (${comments.length} comments)`
            );

        } catch (error) {
            console.error('Failed to save comments to file:', error);
            vscode.window.showErrorMessage(
                `Failed to sync comments: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            throw error;
        }
    }

    /**
     * 从Git文件加载评论
     */
    async loadCommentsFromFile(): Promise<Comment[]> {
        const filePath = this.getCommentsFilePath();
        if (!filePath) {
            return [];
        }

        try {
            const content = await vscode.workspace.fs.readFile(filePath);
            const data: SyncMetadata = JSON.parse(new TextDecoder().decode(content));

            if (!data.comments || !Array.isArray(data.comments)) {
                throw new Error('Invalid comments file format');
            }

            // 转换相对路径回绝对路径
            const absoluteComments = data.comments.map(comment => ({
                ...comment,
                documentUri: this.toAbsolutePath(comment.documentUri),
                replies: comment.replies || []
            }));

            vscode.window.showInformationMessage(
                `📥 Loaded ${absoluteComments.length} comments from Git (last synced by ${data.syncedBy})`
            );

            return absoluteComments;

        } catch (error) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                // 文件不存在是正常情况
                return [];
            }

            console.error('Failed to load comments from file:', error);
            vscode.window.showErrorMessage(
                `Failed to load comments from Git: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            return [];
        }
    }

    /**
     * 检查是否存在同步文件
     */
    async hasSyncFile(): Promise<boolean> {
        const filePath = this.getCommentsFilePath();
        if (!filePath) {
            return false;
        }

        try {
            await vscode.workspace.fs.stat(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取同步文件的元数据
     */
    async getSyncMetadata(): Promise<SyncMetadata | null> {
        const filePath = this.getCommentsFilePath();
        if (!filePath) {
            return null;
        }

        try {
            const content = await vscode.workspace.fs.readFile(filePath);
            const data: SyncMetadata = JSON.parse(new TextDecoder().decode(content));
            return data;
        } catch {
            return null;
        }
    }    /**
     * 转换为相对路径
     */
    protected toRelativePath(absolutePath: string): string {
        try {
            return vscode.workspace.asRelativePath(absolutePath);
        } catch {
            return absolutePath;
        }
    }

    /**
     * 转换为绝对路径
     */
    protected toAbsolutePath(relativePath: string): string {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return relativePath;
        }

        // 如果已经是绝对路径，直接返回
        if (relativePath.includes(':') || relativePath.startsWith('/')) {
            return relativePath;
        }

        return vscode.Uri.joinPath(workspaceFolder.uri, relativePath).toString();
    }    /**
     * 公共合并方法（暴露给外部使用）
     */
    public mergeCommentsPublic(localComments: Comment[], remoteComments: Comment[]): Comment[] {
        return this.mergeComments(localComments, remoteComments);
    }

    /**
     * 执行完整的同步操作
     */
    async performFullSync(localComments: Comment[]): Promise<Comment[]> {
        try {
            // 1. 加载远程评论
            const remoteComments = await this.loadCommentsFromFile();

            // 2. 合并评论
            const mergedComments = await this.mergeComments(localComments, remoteComments);

            // 3. 保存合并后的评论
            await this.saveCommentsToFile(mergedComments);

            vscode.window.showInformationMessage(
                `🔄 Sync completed: ${mergedComments.length} total comments`
            );

            return mergedComments;

        } catch (error) {
            console.error('Full sync failed:', error);
            vscode.window.showErrorMessage(
                `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            throw error;
        }
    }

    /**
     * 设置自动同步
     */
    async setupAutoSync(): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        
        // 更新配置
        await config.update('autoSyncOnSave', true, vscode.ConfigurationTarget.Workspace);
        
        vscode.window.showInformationMessage(
            '✅ Auto-sync enabled! Comments will be synced automatically when you save files.'
        );
    }

    /**
     * 获取Git状态信息
     */
    async getGitStatus(): Promise<string> {
        const filePath = this.getCommentsFilePath();
        if (!filePath) {
            return 'No workspace';
        }

        const hasFile = await this.hasSyncFile();
        if (!hasFile) {
            return 'No sync file';
        }

        const metadata = await this.getSyncMetadata();
        if (!metadata) {
            return 'Invalid sync file';
        }

        const lastUpdated = new Date(metadata.lastUpdated);
        const now = new Date();
        const diffMs = now.getTime() - lastUpdated.getTime();
        const diffMins = Math.floor(diffMs / (1000 * 60));

        return `Synced ${diffMins}m ago by ${metadata.syncedBy}`;
    }
}
