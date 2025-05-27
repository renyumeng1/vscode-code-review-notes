// 位置跟踪测试演示文件
// 用于验证修复后的智能评论位置跟踪系统

function calculateSum(a, b) {
    // 这是一个简单的加法函数
    return a + b;
}

function multiplyNumbers(x, y) {
    // 这里是乘法运算
    const result = x * y;
    return result;
}

function processData(data) {
    // 数据处理函数
    if (!data) {
        throw new Error('数据不能为空');
    }
    
    const processed = data.map(item => {
        return item * 2;
    });
    
    return processed;
}

function handleUserInput(input) {
    // 用户输入处理
    const trimmed = input.trim();
    
    if (trimmed.length === 0) {
        return null;
    }
    
    return trimmed.toUpperCase();
}

// 测试用例
console.log('开始测试位置跟踪功能...');
console.log('请在上面的代码行添加评论，然后进行以下操作测试：');
console.log('1. 按回车键插入空行');
console.log('2. 在代码中间插入新的代码行');
console.log('3. 删除某些代码行');
console.log('4. 观察评论位置是否能正确跟踪');
