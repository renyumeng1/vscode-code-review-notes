// 代码审查演示文件
// 这个文件用于演示我们的代码审查扩展功能

function calculateSum(a, b) {
    // 这里可能需要添加输入验证
    return a + b;
}

function processUserData(userData) {
    // 需要检查数据格式
    const { name, email, age } = userData;
    
    if (!name || !email) {
        throw new Error('Missing required fields');
    }
    
    return {
        displayName: name.toUpperCase(),
        contact: email.toLowerCase(),
        isAdult: age >= 18
    };
}

class UserManager {
    constructor() {
        this.users = [];
    }
    
    addUser(user) {
        // 这里应该检查重复用户
        this.users.push(user);
    }
    
    findUser(email) {
        return this.users.find(u => u.email === email);
    }
    
    removeUser(email) {
        // 可能需要添加错误处理
        const index = this.users.findIndex(u => u.email === email);
        if (index !== -1) {
            this.users.splice(index, 1);
        }
    }
}

// 导出模块
module.exports = {
    calculateSum,
    processUserData,
    UserManager
};
