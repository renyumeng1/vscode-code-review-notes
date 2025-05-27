// 完整的定位算法测试脚本
const { CommentPositionTracker } = require('./out/commentPositionTracker');

// 模拟原始代码
const originalCode = `function calculateSum(a, b) {
    const result = a + b;
    console.log('计算结果:', result);
    return result;
}

class Calculator {
    constructor(name) {
        this.name = name;
    }
    
    add(x, y) {
        return x + y;
    }
}`;

// 模拟修改后的代码（插入了新行，移动了一些内容）
const modifiedCode = `// 新增的注释
function calculateSum(a, b) {
    // 添加输入验证
    if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('参数必须是数字');
    }
    const result = a + b;
    console.log('计算结果:', result);
    return result;
}

class Calculator {
    constructor(name) {
        this.name = name;
        this.version = '1.0'; // 新增属性
    }
    
    add(x, y) {
        return x + y;
    }
}`;

// 创建模拟的评论锚点
const mockComment = {
    anchor: {
        codeSnippet: 'const result = a + b;',
        originalRange: {
            startLine: 1,
            startCharacter: 4,
            endLine: 1,
            endCharacter: 21
        },
        beforeContext: 'function calculateSum(a, b) {',
        afterContext: 'console.log(\'计算结果:\', result);',
        status: 'valid',
        confidence: 1.0,
        lastValidatedAt: Date.now()
    },
    text: '这里计算两个数的和',
    id: 'test-comment-1'
};

// 测试定位算法
async function testPositionTracking() {
    console.log('=== 测试智能评论位置跟踪算法 ===\n');
    
    const tracker = new CommentPositionTracker();
    
    // 模拟文档对象
    const mockDocument = {
        getText: () => modifiedCode
    };
    
    console.log('原始评论位置:');
    console.log(`行 ${mockComment.anchor.originalRange.startLine + 1}: "${mockComment.anchor.codeSnippet}"`);
    console.log(`评论内容: "${mockComment.text}"\n`);
    
    console.log('修改后的代码:');
    console.log(modifiedCode);
    console.log('\n=== 开始重新定位 ===\n');
    
    try {
        const updatedComments = await tracker.validateCommentPositions(mockDocument, [mockComment]);
        const updatedComment = updatedComments[0];
        
        console.log('定位结果:');
        console.log(`状态: ${updatedComment.anchor.status}`);
        
        if (updatedComment.anchor.status === 'moved') {
            const newRange = updatedComment.anchor.currentRange;
            console.log(`新位置: 行 ${newRange.startLine + 1}`);
            console.log(`置信度: ${Math.round(updatedComment.anchor.confidence * 100)}%`);
            
            // 验证新位置的代码
            const lines = modifiedCode.split('\n');
            const foundCode = lines[newRange.startLine].substring(
                newRange.startCharacter, 
                newRange.endCharacter
            );
            console.log(`找到的代码: "${foundCode}"`);
            
            // 计算移动距离
            const moveDistance = Math.abs(newRange.startLine - mockComment.anchor.originalRange.startLine);
            console.log(`移动距离: ${moveDistance} 行`);
            
        } else if (updatedComment.anchor.status === 'valid') {
            console.log('评论位置仍然有效，无需移动');
        } else {
            console.log('⚠️ 未能找到合适的新位置，评论可能已失效');
        }
        
    } catch (error) {
        console.error('测试过程中出错:', error);
    }
}

// 运行测试
testPositionTracking().then(() => {
    console.log('\n=== 测试完成 ===');
}).catch(console.error);
