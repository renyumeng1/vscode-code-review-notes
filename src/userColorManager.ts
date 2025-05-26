import * as vscode from 'vscode';
import { UserColor, UserColorManager } from './types';

/**
 * 用户颜色管理器实现
 */
export class UserColorManagerImpl implements UserColorManager {
    private static readonly STORAGE_KEY = 'codeReviewNotes.userColors';
    private static readonly DEFAULT_COLORS = [
        { bg: 'rgba(255, 193, 7, 0.15)', border: 'rgba(255, 193, 7, 0.8)', text: '#856404' },      // 橙黄色
        { bg: 'rgba(40, 167, 69, 0.15)', border: 'rgba(40, 167, 69, 0.8)', text: '#155724' },     // 绿色
        { bg: 'rgba(0, 123, 255, 0.15)', border: 'rgba(0, 123, 255, 0.8)', text: '#004085' },     // 蓝色
        { bg: 'rgba(220, 53, 69, 0.15)', border: 'rgba(220, 53, 69, 0.8)', text: '#721c24' },     // 红色
        { bg: 'rgba(108, 117, 125, 0.15)', border: 'rgba(108, 117, 125, 0.8)', text: '#495057' }, // 灰色
        { bg: 'rgba(111, 66, 193, 0.15)', border: 'rgba(111, 66, 193, 0.8)', text: '#4a148c' },   // 紫色
        { bg: 'rgba(253, 126, 20, 0.15)', border: 'rgba(253, 126, 20, 0.8)', text: '#bf360c' },   // 深橙色
        { bg: 'rgba(32, 201, 151, 0.15)', border: 'rgba(32, 201, 151, 0.8)', text: '#00695c' }    // 青色
    ];

    private userColors: Map<string, UserColor> = new Map();
    private colorIndex: number = 0;

    constructor(private context: vscode.ExtensionContext) {
        this.loadUserColors();
    }

    /**
     * 获取用户颜色配置
     */
    getUserColor(userId: string): UserColor {
        if (!this.userColors.has(userId)) {
            this.assignColorToUser(userId);
        }
        return this.userColors.get(userId)!;
    }

    /**
     * 获取所有用户颜色配置
     */
    getAllUserColors(): UserColor[] {
        return Array.from(this.userColors.values());
    }

    /**
     * 设置用户颜色
     */
    setUserColor(userId: string, colors: Partial<UserColor>): void {
        const existingColor = this.userColors.get(userId) || this.createDefaultColor(userId);
        const updatedColor: UserColor = {
            ...existingColor,
            ...colors
        };
        this.userColors.set(userId, updatedColor);
        this.saveUserColors();
    }

    /**
     * 为用户分配颜色
     */
    private assignColorToUser(userId: string): void {
        const colorConfig = UserColorManagerImpl.DEFAULT_COLORS[this.colorIndex % UserColorManagerImpl.DEFAULT_COLORS.length];
        const userColor: UserColor = {
            userId,
            backgroundColor: colorConfig.bg,
            borderColor: colorConfig.border,
            textColor: colorConfig.text
        };
        
        this.userColors.set(userId, userColor);
        this.colorIndex++;
        this.saveUserColors();
    }

    /**
     * 创建默认颜色配置
     */
    private createDefaultColor(userId: string): UserColor {
        const colorConfig = UserColorManagerImpl.DEFAULT_COLORS[0];
        return {
            userId,
            backgroundColor: colorConfig.bg,
            borderColor: colorConfig.border,
            textColor: colorConfig.text
        };
    }

    /**
     * 从持久化存储加载用户颜色
     */
    private loadUserColors(): void {
        try {
            const data = this.context.workspaceState.get<{colors: UserColor[], colorIndex: number}>(UserColorManagerImpl.STORAGE_KEY);
            if (data && data.colors) {
                data.colors.forEach(color => {
                    this.userColors.set(color.userId, color);
                });
                this.colorIndex = data.colorIndex || 0;
            }
        } catch (error) {
            console.error('Failed to load user colors:', error);
        }
    }

    /**
     * 保存用户颜色到持久化存储
     */
    private saveUserColors(): void {
        try {
            const data = {
                colors: Array.from(this.userColors.values()),
                colorIndex: this.colorIndex
            };
            this.context.workspaceState.update(UserColorManagerImpl.STORAGE_KEY, data);
        } catch (error) {
            console.error('Failed to save user colors:', error);
        }
    }

    /**
     * 重置所有用户颜色
     */
    resetAllColors(): void {
        this.userColors.clear();
        this.colorIndex = 0;
        this.saveUserColors();
    }

    /**
     * 获取用户颜色预览
     */
    getUserColorPreview(userId: string): string {
        const color = this.getUserColor(userId);
        return `${userId}: ${color.backgroundColor}`;
    }
}
