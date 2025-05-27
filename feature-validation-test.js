// 功能验证脚本 - 用于测试三大新功能的基本可用性

// 测试场景1: 基础代码结构，用于添加评论
function calculateSum(a, b) {
    // 这里应该添加参数验证的评论
    return a + b;
}

// 测试场景2: 类定义，测试多行评论
class Calculator {
    constructor() {
        this.history = [];
    }
    
    // 测试在方法上添加评论
    add(a, b) {
        const result = a + b;
        this.history.push(`${a} + ${b} = ${result}`);
        return result;
    }
    
    // 测试删除评论功能
    subtract(a, b) {
        const result = a - b;
        this.history.push(`${a} - ${b} = ${result}`);
        return result;
    }
    
    // 测试实时监控 - 在这行之前之后插入新行测试位置跟踪
    multiply(a, b) {
        const result = a * b;
        this.history.push(`${a} * ${b} = ${result}`);
        return result;
    }
}

// 测试场景3: 异步函数
async function fetchData(url) {
    try {
        // 可以在这里添加关于错误处理的评论
        const response = await fetch(url);
        return await response.json();
    } catch (error) {
        // 测试错误处理代码的评论
        console.error('Fetch failed:', error);
        throw error;
    }
}

// 测试场景4: 复杂逻辑，测试评论在代码重构时的位置跟踪
function processUserData(users) {
    return users
        .filter(user => user.active)  // 过滤活跃用户
        .map(user => ({               // 转换数据格式
            id: user.id,
            name: user.name,
            email: user.email
        }))
        .sort((a, b) => a.name.localeCompare(b.name)); // 按名称排序
}

// 测试场景5: 条件语句
function validateUser(user) {
    if (!user) {
        throw new Error('User is required');
    }
    
    if (!user.email) {
        throw new Error('Email is required');
    }
    
    if (!user.name) {
        throw new Error('Name is required');
    }
    
    return true;
}

// 使用示例 - 可以在这些行添加评论测试
const calc = new Calculator();
console.log(calc.add(5, 3));
console.log(calc.multiply(4, 7));

// 测试数据
const users = [
    { id: 1, name: 'Alice', email: 'alice@test.com', active: true },
    { id: 2, name: 'Bob', email: 'bob@test.com', active: false },
    { id: 3, name: 'Charlie', email: 'charlie@test.com', active: true }
];

const processedUsers = processUserData(users);
console.log('Processed users:', processedUsers);
