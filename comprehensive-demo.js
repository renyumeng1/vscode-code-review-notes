#!/usr/bin/env node

/**
 * VS Code 代码评论扩展演示脚本
 * 
 * 这个脚本包含了各种代码模式，用于展示评论功能的不同使用场景
 */

// ==================== 基础函数演示 ====================

/**
 * 简单的数学计算函数
 * 用于演示基础评论功能
 */
function calculateArea(length, width) {
    // 这里可以添加参数验证的评论
    return length * width;
}

/**
 * 数组处理函数
 * 演示代码优化相关的评论
 */
function processNumbers(numbers) {
    const result = [];
    
    // 这个循环可能需要性能优化的评论
    for (let i = 0; i < numbers.length; i++) {
        if (numbers[i] > 0) {
            result.push(numbers[i] * 2);
        }
    }
    
    return result;
}

// ==================== 异步操作演示 ====================

/**
 * 异步数据获取函数
 * 演示异步代码的评论场景
 */
async function fetchUserData(userId) {
    try {
        // 这里需要添加错误处理的评论
        const response = await fetch(`/api/users/${userId}`);
        const data = await response.json();
        
        // 数据验证逻辑可以在这里评论
        if (!data.id) {
            throw new Error('无效的用户数据');
        }
        
        return data;
    } catch (error) {
        // 错误处理逻辑的评论区域
        console.error('获取用户数据失败:', error);
        throw error;
    }
}

// ==================== 类定义演示 ====================

/**
 * 用户管理类
 * 演示面向对象代码的评论
 */
class UserService {
    constructor(apiBase = '/api') {
        this.apiBase = apiBase;
        this.cache = new Map();
    }

    /**
     * 创建新用户
     * 这个方法可能需要权限检查的评论
     */
    async createUser(userData) {
        // 输入验证逻辑 - 可以添加关于验证规则的评论
        if (!userData.email || !userData.name) {
            throw new Error('缺少必要的用户信息');
        }

        // API调用 - 可以评论关于错误重试机制
        const response = await fetch(`${this.apiBase}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(userData)
        });

        if (!response.ok) {
            throw new Error(`创建用户失败: ${response.statusText}`);
        }

        const newUser = await response.json();
        
        // 缓存更新 - 可以评论缓存策略
        this.cache.set(newUser.id, newUser);
        
        return newUser;
    }

    /**
     * 获取用户信息
     * 演示缓存逻辑的评论场景
     */
    async getUser(userId) {
        // 缓存检查 - 性能优化相关评论
        if (this.cache.has(userId)) {
            return this.cache.get(userId);
        }

        // 数据库查询 - 可以评论查询优化
        const user = await fetchUserData(userId);
        
        // 缓存存储 - 缓存过期策略评论
        this.cache.set(userId, user);
        
        return user;
    }

    /**
     * 批量更新用户
     * 复杂逻辑的评论演示
     */
    async batchUpdateUsers(updates) {
        const results = [];
        
        // 并发处理 - 可以评论关于并发限制
        for (const update of updates) {
            try {
                const result = await this.updateUser(update.id, update.data);
                results.push({ success: true, user: result });
            } catch (error) {
                // 错误收集 - 错误处理策略评论
                results.push({ 
                    success: false, 
                    error: error.message,
                    userId: update.id 
                });
            }
        }

        return results;
    }

    /**
     * 清理过期缓存
     * 内存管理相关的评论区域
     */
    cleanupCache() {
        // 简单的缓存清理逻辑
        // 生产环境需要更复杂的过期策略
        this.cache.clear();
    }
}

// ==================== 工具函数演示 ====================

/**
 * 数据验证工具
 * 展示工具函数的评论场景
 */
const ValidationUtils = {
    /**
     * 邮箱格式验证
     * 可以评论正则表达式的复杂性
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * 密码强度检查
     * 安全策略相关评论
     */
    isStrongPassword(password) {
        // 密码强度规则 - 可以评论安全要求
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return password.length >= minLength && 
               hasUpperCase && 
               hasLowerCase && 
               hasNumbers && 
               hasSpecialChar;
    },

    /**
     * 数据清理函数
     * 数据处理逻辑评论
     */
    sanitizeInput(input) {
        if (typeof input !== 'string') {
            return input;
        }

        // HTML标签清理 - 安全性评论
        return input
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim();
    }
};

// ==================== 配置和常量 ====================

/**
 * 应用配置
 * 配置管理相关评论
 */
const AppConfig = {
    // API配置 - 可以评论环境相关设置
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:3000/api',
    API_TIMEOUT: 5000,
    
    // 缓存配置 - 性能调优评论
    CACHE_TTL: 5 * 60 * 1000, // 5分钟
    MAX_CACHE_SIZE: 1000,
    
    // 用户设置 - 用户体验评论
    DEFAULT_PAGE_SIZE: 20,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    
    // 安全设置 - 安全策略评论
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30分钟
    MAX_LOGIN_ATTEMPTS: 5
};

// ==================== 使用示例 ====================

// 演示基础用法
console.log('矩形面积:', calculateArea(10, 5));

// 演示数组处理
const numbers = [1, -2, 3, -4, 5];
console.log('处理后的数字:', processNumbers(numbers));

// 演示用户服务
const userService = new UserService();

// 这里可以添加关于初始化顺序的评论
async function initializeApp() {
    try {
        // 应用启动逻辑 - 可以评论启动步骤
        console.log('应用初始化中...');
        
        // 配置验证 - 配置检查评论
        if (!AppConfig.API_BASE_URL) {
            throw new Error('API基础URL未配置');
        }
        
        console.log('应用初始化完成');
    } catch (error) {
        // 启动失败处理 - 错误恢复评论
        console.error('应用初始化失败:', error);
        process.exit(1);
    }
}

// 导出模块
module.exports = {
    UserService,
    ValidationUtils,
    AppConfig,
    calculateArea,
    processNumbers,
    fetchUserData
};

// ==================== 测试代码区域 ====================

/**
 * 这个区域专门用于测试评论功能
 * 
 * 使用说明：
 * 1. 选择任意代码段并添加评论
 * 2. 尝试不同长度的评论文本
 * 3. 测试多行代码的评论
 * 4. 验证用户颜色系统
 * 5. 测试评论的解决/重新打开功能
 */

// 单行注释测试
const testVariable = 'Hello World';

// 多行代码块测试
function complexFunction(param1, param2, options = {}) {
    const defaultOptions = {
        validate: true,
        transform: false,
        cache: true
    };
    
    const config = { ...defaultOptions, ...options };
    
    if (config.validate) {
        // 验证逻辑
        if (!param1 || !param2) {
            throw new Error('参数不能为空');
        }
    }
    
    if (config.transform) {
        // 转换逻辑
        param1 = String(param1).toLowerCase();
        param2 = String(param2).toLowerCase();
    }
    
    return {
        result: `${param1}-${param2}`,
        timestamp: Date.now(),
        config: config
    };
}

// 数组和对象测试
const testData = {
    users: [
        { id: 1, name: 'Alice', role: 'admin' },
        { id: 2, name: 'Bob', role: 'user' },
        { id: 3, name: 'Charlie', role: 'moderator' }
    ],
    settings: {
        theme: 'dark',
        language: 'zh-CN',
        notifications: true
    }
};

// 异步操作测试
async function asyncTestFunction() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return 'Async operation completed';
}

console.log('演示脚本加载完成 - 准备测试评论功能！');
