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
 * 评论接口
 */
export interface Comment {
    id: string; // UUID
    documentUri: string; // 文件URI
    range: CommentRange;
    text: string;
    author: string;
    timestamp: number; // Unix时间戳
    resolved: boolean;
    resolvedBy?: string; // 解决评论的用户
    resolvedAt?: number; // 解决时间戳
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
