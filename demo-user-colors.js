// 用户特定颜色功能演示文件
// 使用此文件测试不同用户的评论颜色功能

/**
 * 用户服务类 - Alice 可能会评论这里需要更好的文档
 */
class UserService {
    constructor() {
        this.users = [];
        this.isInitialized = false;
    }

    // Bob 可能会建议这个方法需要输入验证
    addUser(userData) {
        if (!this.validateUserData(userData)) {
            throw new Error('Invalid user data');
        }
        
        const user = {
            id: this.generateId(),
            ...userData,
            createdAt: new Date()
        };
        
        this.users.push(user);
        return user;
    }

    // Charlie 已经优化了这个查找方法的性能
    findUserById(userId) {
        // 使用 Map 可能会更高效 - Diana 的建议
        return this.users.find(user => user.id === userId);
    }

    // Alice 可能会指出这里缺少错误处理
    async saveToDatabase() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        
        // 模拟异步数据库保存
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                console.log('Users saved to database');
                resolve(true);
            }, 1000);
        });
    }

    // Bob 建议这个方法应该返回更详细的验证错误
    validateUserData(userData) {
        if (!userData || typeof userData !== 'object') {
            return false;
        }
        
        if (!userData.name || userData.name.trim().length === 0) {
            return false;
        }
        
        if (!userData.email || !this.isValidEmail(userData.email)) {
            return false;
        }
        
        return true;
    }

    // Charlie 已经测试过这个邮箱验证方法
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Diana 需要审查这个ID生成逻辑的安全性
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    // Alice, Bob, Charlie, Diana 都需要讨论这个初始化方法
    async initialize() {
        console.log('Initializing UserService...');
        this.isInitialized = true;
        
        // 加载默认配置
        await this.loadConfiguration();
    }

    async loadConfiguration() {
        // 这里可能需要从配置文件加载设置
        console.log('Loading configuration...');
    }
}

// 导出服务实例
module.exports = new UserService();
