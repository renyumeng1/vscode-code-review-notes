import * as vscode from 'vscode';
import { Comment } from './types';
import { SyncStrategy, SyncMethod, SyncResult } from './syncStrategy';
import { LocalSyncStrategy } from './localSyncStrategy';
import { GitSyncStrategy } from './gitSyncService';
import { ServerSyncStrategy } from './serverSyncStrategy';

/**
 * 同步管理器 - 负责管理不同的同步策略
 */
export class SyncManager {
    private context: vscode.ExtensionContext;
    private localStrategy: LocalSyncStrategy;
    private gitStrategy: GitSyncStrategy;
    private serverStrategy: ServerSyncStrategy;
    private currentStrategy: SyncStrategy;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.localStrategy = new LocalSyncStrategy(context);
        this.gitStrategy = new GitSyncStrategy(context);
        this.serverStrategy = new ServerSyncStrategy(context);
        
        // 根据配置选择默认策略
        this.currentStrategy = this.getConfiguredStrategy();
    }    /**
     * 根据配置获取当前策略
     */
    private getConfiguredStrategy(): SyncStrategy {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        const syncMethod = config.get<string>('syncMethod', 'local');
        
        switch (syncMethod) {
            case 'git':
                return this.gitStrategy;
            case 'server':
                return this.serverStrategy;
            case 'local':
            default:
                return this.localStrategy;
        }
    }

    /**
     * 设置同步策略
     */
    async setSyncMethod(method: SyncMethod): Promise<void> {
        const config = vscode.workspace.getConfiguration('codeReviewNotes');
        await config.update('syncMethod', method, vscode.ConfigurationTarget.Workspace);
          switch (method) {
            case SyncMethod.Git:
                this.currentStrategy = this.gitStrategy;
                break;
            case SyncMethod.Server:
                this.currentStrategy = this.serverStrategy;
                break;
            case SyncMethod.Local:
            default:
                this.currentStrategy = this.localStrategy;
                break;
        }
        
        vscode.window.showInformationMessage(`同步方法已切换为: ${this.getSyncMethodDisplayName(method)}`);
    }

    /**
     * 获取同步方法的显示名称
     */
    private getSyncMethodDisplayName(method: SyncMethod): string {
        switch (method) {
            case SyncMethod.Git:
                return 'Git同步';
            case SyncMethod.Local:
                return '本地存储';
            case SyncMethod.Server:
                return '服务器同步（即将推出）';
            default:
                return '未知';
        }
    }

    /**
     * 获取当前同步策略
     */
    getCurrentStrategy(): SyncStrategy {
        return this.currentStrategy;
    }

    /**
     * 获取当前同步方法
     */
    getCurrentSyncMethod(): SyncMethod {
        return this.currentStrategy.getSyncMethod();
    }

    /**
     * 检查策略是否支持
     */
    async isCurrentStrategySupported(): Promise<boolean> {
        return await this.currentStrategy.isSupported();
    }

    /**
     * 保存评论
     */
    async saveComments(comments: Comment[]): Promise<SyncResult> {
        return await this.currentStrategy.saveComments(comments);
    }

    /**
     * 加载评论
     */
    async loadComments(): Promise<Comment[]> {
        return await this.currentStrategy.loadComments();
    }

    /**
     * 执行完整同步
     */
    async performFullSync(localComments: Comment[]): Promise<Comment[]> {
        return await this.currentStrategy.performFullSync(localComments);
    }

    /**
     * 获取同步状态
     */
    async getSyncStatus(): Promise<string> {
        const method = this.getSyncMethodDisplayName(this.getCurrentSyncMethod());
        const status = await this.currentStrategy.getSyncStatus();
        return `${method}: ${status}`;
    }    /**
     * 合并评论（公共接口）
     */
    mergeComments(localComments: Comment[], remoteComments: Comment[]): Comment[] {
        // 使用当前策略的合并逻辑
        if (this.currentStrategy instanceof GitSyncStrategy) {
            return this.gitStrategy.mergeCommentsPublic(localComments, remoteComments);
        } else {
            // 本地策略不需要合并，直接返回本地评论
            return localComments;
        }
    }    /**
     * 获取所有可用的同步方法
     */
    async getAvailableSyncMethods(): Promise<{ method: SyncMethod, displayName: string, supported: boolean }[]> {
        const methods = [
            {
                method: SyncMethod.Local,
                displayName: this.getSyncMethodDisplayName(SyncMethod.Local),
                supported: await this.localStrategy.isSupported()
            },
            {
                method: SyncMethod.Git,
                displayName: this.getSyncMethodDisplayName(SyncMethod.Git),
                supported: await this.gitStrategy.isSupported()
            },
            {
                method: SyncMethod.Server,
                displayName: this.getSyncMethodDisplayName(SyncMethod.Server),
                supported: await this.serverStrategy.isSupported()
            }
        ];

        return methods;
    }

    /**
     * 显示同步方法选择器
     */
    async showSyncMethodPicker(): Promise<void> {
        const availableMethods = await this.getAvailableSyncMethods();
        const currentMethod = this.getCurrentSyncMethod();

        const items = availableMethods.map(method => ({
            label: method.displayName,
            description: method.method === currentMethod ? '(当前)' : '',
            detail: method.supported ? '✅ 支持' : '❌ 不支持',
            method: method.method,
            enabled: method.supported
        }));

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: '选择同步方法',
            title: '评论同步设置'
        });

        if (selection && selection.enabled && selection.method !== currentMethod) {
            await this.setSyncMethod(selection.method);
        }
    }    /**
     * Git特定操作 - 仅在Git策略可用时
     */
    async gitSpecificOperations() {
        if (!(this.gitStrategy instanceof GitSyncStrategy)) {
            throw new Error('Git strategy not available');
        }

        return {
            saveToFile: (comments: Comment[]) => this.gitStrategy.saveCommentsToFile(comments),
            loadFromFile: () => this.gitStrategy.loadCommentsFromFile(),
            setupAutoSync: () => this.gitStrategy.setupAutoSync(),
            getGitStatus: () => this.gitStrategy.getGitStatus()
        };
    }

    /**
     * 服务器特定操作 - 仅在服务器策略可用时
     */
    async serverSpecificOperations() {
        if (!(this.serverStrategy instanceof ServerSyncStrategy)) {
            throw new Error('Server strategy not available');
        }

        return {
            configureServer: () => this.serverStrategy.configureServer(),
            testConnection: () => this.serverStrategy.testConnection(),
            syncProjectSettings: () => this.serverStrategy.syncProjectSettings(),
            getTeamMembers: () => this.serverStrategy.getTeamMembers(),
            enableRealTimeSync: () => this.serverStrategy.enableRealTimeSync()
        };
    }
}
