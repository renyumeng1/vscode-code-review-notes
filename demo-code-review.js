// 演示文件 - VS Code代码评论扩展功能展示

/**
 * 用户管理类
 * 这是一个示例类，用于演示代码评论功能
 */
class UserManager {
    constructor() {
        this.users = [];
        this.currentUser = null;
    }

    /**
     * 添加新用户
     * @param {Object} user - 用户对象
     */
    addUser(user) {
        // 这里需要添加用户验证逻辑
        if (!user.email || !user.name) {
            throw new Error('用户信息不完整');
        }
        
        // 检查邮箱是否已存在
        const existingUser = this.users.find(u => u.email === user.email);
        if (existingUser) {
            return { success: false, message: '邮箱已存在' };
        }

        this.users.push({
            ...user,
            id: this.generateUserId(),
            createdAt: new Date()
        });
        
        return { success: true, message: '用户添加成功' };
    }

    /**
     * 生成用户ID
     */
    generateUserId() {
        // 简单的ID生成逻辑，生产环境应使用更安全的方法
        return Math.random().toString(36).substr(2, 9);
    }

    /**
     * 获取用户列表
     */
    getUsers() {
        return this.users.filter(user => user.active !== false);
    }

    /**
     * 根据ID查找用户
     * @param {string} userId - 用户ID
     */
    findUserById(userId) {
        return this.users.find(user => user.id === userId);
    }

    /**
     * 更新用户信息
     */
    updateUser(userId, updates) {
        const userIndex = this.users.findIndex(user => user.id === userId);
        if (userIndex === -1) {
            throw new Error('用户不存在');
        }

        // 验证更新数据
        if (updates.email) {
            const emailExists = this.users.some(user => 
                user.email === updates.email && user.id !== userId
            );
            if (emailExists) {
                throw new Error('邮箱已被其他用户使用');
            }
        }

        this.users[userIndex] = {
            ...this.users[userIndex],
            ...updates,
            updatedAt: new Date()
        };

        return this.users[userIndex];
    }

    /**
     * 删除用户（软删除）
     */
    deleteUser(userId) {
        const user = this.findUserById(userId);
        if (!user) {
            throw new Error('用户不存在');
        }

        // 软删除，保留数据但标记为非活跃
        user.active = false;
        user.deletedAt = new Date();
    }

    /**
     * 用户认证
     */
    authenticate(email, password) {
        // 这里应该有密码哈希验证
        const user = this.users.find(u => u.email === email && u.active !== false);
        
        if (!user) {
            return { success: false, message: '用户不存在' };
        }

        // 简化的密码验证（实际应用中需要哈希比较）
        if (user.password !== password) {
            return { success: false, message: '密码错误' };
        }

        this.currentUser = user;
        return { success: true, user: user };
    }

    /**
     * 获取当前登录用户
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * 用户登出
     */
    logout() {
        this.currentUser = null;
    }
}

// 使用示例
const userManager = new UserManager();

// 添加测试用户
userManager.addUser({
    name: 'Alice Johnson',
    email: 'alice@example.com',
    password: 'password123',
    role: 'admin'
});

userManager.addUser({
    name: 'Bob Smith',
    email: 'bob@example.com',
    password: 'securepass',
    role: 'user'
});

// 测试功能
console.log('所有用户:', userManager.getUsers());

module.exports = UserManager;
