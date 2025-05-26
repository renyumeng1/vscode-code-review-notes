// 测试文件 - 用于演示代码评论功能

function calculateSum(a, b) {
    // TODO: 需要添加参数验证
    return a + b;
}

function processData(data) {
    const result = [];
    
    // 这里的逻辑可能需要优化
    for (let i = 0; i < data.length; i++) {
        if (data[i] > 0) {
            result.push(data[i] * 2);
        }
    }
    
    return result;
}

// 新增函数：数据验证
function validateInput(input) {
    // 这个函数需要更完善的验证逻辑
    if (!Array.isArray(input)) {
        throw new Error('Input must be an array');
    }
    return input.every(item => typeof item === 'number');
}

// 新增函数：异步数据处理
async function fetchAndProcessData(url) {
    try {
        // 这里应该添加错误处理
        const response = await fetch(url);
        const data = await response.json();
        return processData(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

// 主函数
function main() {
    const numbers = [1, -2, 3, -4, 5];
    const processed = processData(numbers);
    const sum = calculateSum(processed[0], processed[1]);
    
    console.log('Processed data:', processed);
    console.log('Sum:', sum);
}

main();
