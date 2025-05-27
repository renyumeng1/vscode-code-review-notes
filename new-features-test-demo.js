// 新功能测试演示文件
// 用于测试三大核心功能：实时监控、删除评论、内联UI

class UserManager {
    constructor() {
        this.users = [];
        this.nextId = 1;
    }

    // 添加用户方法 - 这里可以添加评论测试
    addUser(name, email) {
        const user = {
            id: this.nextId++,
            name: name,
            email: email,
            createdAt: new Date()
        };
        
        this.users.push(user);
        return user;
    }

    // 查找用户方法 - 测试评论位置跟踪
    findUser(id) {
        return this.users.find(user => user.id === id);
    }

    // 更新用户信息
    updateUser(id, updates) {
        const user = this.findUser(id);
        if (user) {
            Object.assign(user, updates);
            return user;
        }
        return null;
    }

    // 删除用户 - 测试删除评论功能
    deleteUser(id) {
        const index = this.users.findIndex(user => user.id === id);
        if (index !== -1) {
            return this.users.splice(index, 1)[0];
        }
        return null;
    }

    // 获取所有用户
    getAllUsers() {
        return [...this.users];
    }

    // 根据邮箱查找用户
    findByEmail(email) {
        return this.users.filter(user => 
            user.email.toLowerCase().includes(email.toLowerCase())
        );
    }

    // 用户统计信息
    getStats() {
        return {
            totalUsers: this.users.length,
            latestUser: this.users[this.users.length - 1],
            oldestUser: this.users[0]
        };
    }
}

// 测试数据和使用示例
const userManager = new UserManager();

// 添加测试用户
userManager.addUser("张三", "zhangsan@example.com");
userManager.addUser("李四", "lisi@example.com");
userManager.addUser("王五", "wangwu@example.com");

// 测试查找功能
console.log("查找用户 ID 1:", userManager.findUser(1));
console.log("按邮箱查找:", userManager.findByEmail("zhang"));

// 测试更新功能
userManager.updateUser(1, { name: "张三丰" });
console.log("更新后的用户:", userManager.findUser(1));

// 测试删除功能
const deletedUser = userManager.deleteUser(2);
console.log("删除的用户:", deletedUser);
console.log("剩余用户:", userManager.getAllUsers());

// 显示统计信息
console.log("用户统计:", userManager.getStats());

// 异步操作示例
async function loadUsersFromAPI() {
    try {
        // 模拟API调用
        const response = await fetch('/api/users');
        const users = await response.json();
        
        users.forEach(userData => {
            userManager.addUser(userData.name, userData.email);
        });
        
        return userManager.getAllUsers();
    } catch (error) {
        console.error("加载用户失败:", error);
        return [];
    }
}

// 工具函数
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function formatUserForDisplay(user) {
    return `${user.name} (${user.email}) - 创建于: ${user.createdAt.toLocaleDateString()}`;
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        UserManager,
        validateEmail,
        formatUserForDisplay
    };
}
