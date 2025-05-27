/**
 * 评论范围接口
 */
export interface CommentRange {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
}

/**
 * 评论回复接口
 */
export interface CommentReply {
    id: string; // UUID
    parentId: string; // 父评论ID
    author: string;
    text: string;
    timestamp: number; // Unix时间戳
}

/**
 * 评论锚点接口 - 用于智能位置追踪
 */
export interface CommentAnchor {
    // 原始位置信息
    originalRange: CommentRange;
    
    // 内容锚点 - 用于重新定位
    beforeContext?: string;  // 评论前的代码上下文
    afterContext?: string;   // 评论后的代码上下文
    codeSnippet: string;     // 评论对应的代码片段
    
    // 位置状态
    status: 'valid' | 'moved' | 'deleted' | 'conflict';
    lastValidatedAt: number;
    
    // 如果移动了，新的位置
    currentRange?: CommentRange;
    confidence?: number;     // 重定位的置信度 0-1
}

/**
 * 评论接口
 */
export interface Comment {
    id: string; // UUID
    documentUri: string; // 文件URI
    anchor: CommentAnchor; // 使用智能锚点替换简单的range
    text: string;
    author: string;
    timestamp: number; // Unix时间戳
    resolved: boolean;
    resolvedBy?: string; // 解决评论的用户
    resolvedAt?: number; // 解决时间戳
    replies: CommentReply[];
}

/**
 * 兼容性：保留旧的range字段的评论接口
 */
export interface LegacyComment {
    id: string;
    documentUri: string;
    range: CommentRange; // 旧版本使用的字段
    text: string;
    author: string;
    timestamp: number;
    resolved: boolean;
    resolvedBy?: string;
    resolvedAt?: number;
    replies: CommentReply[];
}

/**
 * 评论数据存储接口
 */
export interface CommentData {
    comments: Comment[];
    version: string;
}

/**
 * 用户颜色配置接口
 */
export interface UserColor {
    userId: string;
    backgroundColor: string;
    borderColor: string;
    textColor: string;
}

/**
 * 用户颜色管理器接口
 */
export interface UserColorManager {
    getUserColor(userId: string): UserColor;
    getAllUserColors(): UserColor[];
    setUserColor(userId: string, colors: Partial<UserColor>): void;
}

/**
 * 通知等级枚举
 */
export enum NotificationLevel {
    None = 'none',
    Minimal = 'minimal',
    Verbose = 'verbose'
}
