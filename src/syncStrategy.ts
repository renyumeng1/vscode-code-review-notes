import * as vscode from 'vscode';
import { Comment } from './types';

/**
 * 同步元数据接口
 */
export interface SyncMetadata {
    version: string;
    generatedBy: string;
    lastUpdated: string;
    syncedBy: string;
    syncMethod: SyncMethod;
    comments: Comment[];
}

/**
 * 同步方法枚举
 */
export enum SyncMethod {
    Local = 'local',
    Git = 'git',
    Server = 'server' // 预留给服务端同步
}

/**
 * 同步结果接口
 */
export interface SyncResult {
    success: boolean;
    message: string;
    comments?: Comment[];
    conflictCount?: number;
}

/**
 * 同步策略抽象基类
 */
export abstract class SyncStrategy {
    protected context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * 获取同步方法类型
     */
    abstract getSyncMethod(): SyncMethod;

    /**
     * 检查是否支持此同步方法
     */
    abstract isSupported(): Promise<boolean>;

    /**
     * 保存评论
     */
    abstract saveComments(comments: Comment[]): Promise<SyncResult>;

    /**
     * 加载评论
     */
    abstract loadComments(): Promise<Comment[]>;

    /**
     * 执行完整同步（合并本地和远程）
     */
    abstract performFullSync(localComments: Comment[]): Promise<Comment[]>;

    /**
     * 获取同步状态信息
     */
    abstract getSyncStatus(): Promise<string>;

    /**
     * 获取配置前缀
     */
    protected getConfigPrefix(): string {
        return 'codeReviewNotes';
    }

    /**
     * 获取当前用户
     */
    protected getCurrentUser(): string {
        const config = vscode.workspace.getConfiguration(this.getConfigPrefix());
        return config.get<string>('defaultAuthor', 'User');
    }

    /**
     * 合并评论的通用实现
     */
    protected mergeComments(localComments: Comment[], remoteComments: Comment[]): Comment[] {
        const merged = new Map<string, Comment>();

        // 先添加本地评论
        localComments.forEach(comment => {
            merged.set(comment.id, comment);
        });

        // 然后合并远程评论
        remoteComments.forEach(remoteComment => {
            const existing = merged.get(remoteComment.id);
            
            if (!existing) {
                // 新评论，直接添加
                merged.set(remoteComment.id, remoteComment);
            } else {
                // 存在冲突，选择更新时间较晚的
                const existingTime = existing.timestamp;
                const remoteTime = remoteComment.timestamp;
                
                if (remoteTime > existingTime) {
                    // 合并回复
                    const allReplies = [
                        ...(existing.replies || []),
                        ...(remoteComment.replies || [])
                    ];
                      // 去重回复（基于ID和内容）
                    const uniqueReplies = Array.from(
                        new Map(allReplies.map(reply => 
                            [`${reply.author}-${reply.text}-${reply.timestamp}`, reply]
                        )).values()
                    ).sort((a, b) => a.timestamp - b.timestamp);

                    merged.set(remoteComment.id, {
                        ...remoteComment,
                        replies: uniqueReplies
                    });
                }
            }
        });

        return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);
    }

    /**
     * 转换为相对路径（用于可移植性）
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
    }
}
