// 测试回车键导致位置失效的问题

class PositionTracker {
    isOriginalPositionValid(lines, anchor) {
        const range = anchor.originalRange;
        
        // 检查行号是否越界
        if (range.startLine >= lines.length || range.endLine >= lines.length) {
            console.log(`❌ 行号越界: 原始行${range.startLine + 1}, 当前总行数${lines.length}`);
            return false;
        }
        
        // 检查代码片段是否匹配
        const currentSnippet = this.extractSnippetFromLines(lines, range);
        const isMatch = currentSnippet.trim() === anchor.codeSnippet.trim();
        
        console.log(`📍 检查原始位置 (第${range.startLine + 1}行):`);
        console.log(`   期望代码: "${anchor.codeSnippet.trim()}"`);
        console.log(`   实际代码: "${currentSnippet.trim()}"`);
        console.log(`   匹配结果: ${isMatch ? '✅' : '❌'}`);
        
        return isMatch;
    }
    
    extractSnippetFromLines(lines, range) {
        return lines
            .slice(range.startLine, range.endLine + 1)
            .map((line, index) => {
                if (index === 0 && index === range.endLine - range.startLine) {
                    // 单行情况
                    return line.substring(range.startCharacter, range.endCharacter);
                } else if (index === 0) {
                    // 第一行
                    return line.substring(range.startCharacter);
                } else if (index === range.endLine - range.startLine) {
                    // 最后一行
                    return line.substring(0, range.endCharacter);
                } else {
                    // 中间行
                    return line;
                }
            })
            .join('\n');
    }
}

// 模拟测试场景
console.log('=== 测试回车键导致位置失效问题 ===\n');

// 原始代码
const originalCode = `function calculateSum(a, b) {
    const result = a + b;
    console.log('计算结果:', result);
    return result;
}`;

// 在第一行后按回车插入空行
const modifiedCode = `function calculateSum(a, b) {

    const result = a + b;
    console.log('计算结果:', result);
    return result;
}`;

console.log('原始代码:');
originalCode.split('\n').forEach((line, index) => {
    const marker = index === 1 ? ' 👈 评论在这里' : '';
    console.log(`${index + 1}: ${line}${marker}`);
});

console.log('\n修改后代码（插入空行）:');
modifiedCode.split('\n').forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
});

// 模拟评论锚点（指向第2行的代码）
const mockComment = {
    anchor: {
        codeSnippet: 'const result = a + b;',
        originalRange: {
            startLine: 1,  // 第2行（0-based）
            startCharacter: 4,
            endLine: 1,
            endCharacter: 21
        },
        beforeContext: 'function calculateSum(a, b) {',
        afterContext: 'console.log(\'计算结果:\', result);'
    }
};

const tracker = new PositionTracker();
const originalLines = originalCode.split('\n');
const modifiedLines = modifiedCode.split('\n');

console.log('\n--- 原始代码中的位置验证 ---');
const originalValid = tracker.isOriginalPositionValid(originalLines, mockComment.anchor);

console.log('\n--- 插入空行后的位置验证 ---');
const modifiedValid = tracker.isOriginalPositionValid(modifiedLines, mockComment.anchor);

console.log('\n=== 分析结果 ===');
console.log(`原始代码位置验证: ${originalValid ? '✅ 有效' : '❌ 无效'}`);
console.log(`修改后位置验证: ${modifiedValid ? '✅ 有效' : '❌ 无效'}`);

if (!modifiedValid) {
    console.log('\n🔍 问题分析:');
    console.log('- 用户仅仅插入了一个空行');
    console.log('- 评论指向的代码并未改变');
    console.log('- 但是由于行号偏移，原始位置验证失败');
    console.log('- 这导致评论被错误地标记为失效');
}
