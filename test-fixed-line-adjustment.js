// 测试修复后的智能行号调整功能

class FixedPositionTracker {
    /**
     * 尝试智能调整行号偏移（处理简单的插入/删除行操作）
     */
    tryAdjustLineOffset(lines, anchor) {
        const originalRange = anchor.originalRange;
        const codeSnippet = anchor.codeSnippet.trim();
        
        console.log(`🔧 尝试智能行号调整:`);
        console.log(`  原始位置: 第 ${originalRange.startLine + 1} 行`);
        console.log(`  目标代码: "${codeSnippet}"`);
        
        // 在原始位置附近搜索代码片段（上下各搜索3行）
        const searchStart = Math.max(0, originalRange.startLine - 3);
        const searchEnd = Math.min(lines.length - 1, originalRange.startLine + 3);
        
        console.log(`  搜索范围: 第 ${searchStart + 1} 行到第 ${searchEnd + 1} 行`);
        
        for (let i = searchStart; i <= searchEnd; i++) {
            const currentLine = lines[i];
            console.log(`    第 ${i + 1} 行: "${currentLine.trim()}"`);
            
            // 检查是否找到完全匹配的代码片段
            if (currentLine.trim() === codeSnippet) {
                // 找到了，说明只是行号发生了偏移
                const lineOffset = i - originalRange.startLine;
                
                console.log(`  ✅ 找到匹配! 行号偏移: ${lineOffset > 0 ? '+' : ''}${lineOffset}`);
                
                if (lineOffset !== 0) {
                    // 返回调整后的锚点
                    return {
                        ...anchor,
                        originalRange: {
                            startLine: i,
                            startCharacter: currentLine.indexOf(codeSnippet),
                            endLine: i,
                            endCharacter: currentLine.indexOf(codeSnippet) + codeSnippet.length
                        }
                    };
                }
            }
        }
        
        console.log(`  ❌ 未找到简单偏移`);
        // 没有找到简单的偏移，返回原始锚点
        return anchor;
    }
    
    isOriginalPositionValid(lines, anchor) {
        const range = anchor.originalRange;
        
        // 检查行号是否越界
        if (range.startLine >= lines.length || range.endLine >= lines.length) {
            return false;
        }
        
        // 检查代码片段是否匹配
        const currentSnippet = this.extractSnippetFromLines(lines, range);
        return currentSnippet.trim() === anchor.codeSnippet.trim();
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
    
    validateCommentPosition(lines, comment) {
        const anchor = comment.anchor;
        const originalRange = anchor.originalRange;
        
        console.log(`\n=== 验证评论位置 ===`);
        
        // 1. 首先尝试智能行号调整（处理简单的行号偏移）
        const adjustedAnchor = this.tryAdjustLineOffset(lines, anchor);
        
        // 2. 检查调整后的位置是否有效
        if (this.isOriginalPositionValid(lines, adjustedAnchor)) {
            console.log(`✅ 位置验证成功!`);
            return {
                ...comment,
                anchor: {
                    ...adjustedAnchor,
                    status: 'valid',
                    lastValidatedAt: Date.now()
                }
            };
        }
        
        console.log(`❌ 位置验证失败，需要重新定位`);
        return {
            ...comment,
            anchor: {
                ...anchor,
                status: 'deleted',
                lastValidatedAt: Date.now()
            }
        };
    }
}

// 测试场景
function testFixedLineAdjustment() {
    console.log('=== 测试修复后的智能行号调整功能 ===\n');
    
    const tracker = new FixedPositionTracker();
    
    // 原始代码
    const originalCode = `function test() {
    const result = calculateSum(1, 2);
    console.log(result);
}`;
    
    // 用户在第1行后按回车键，插入空行
    const modifiedCode = `function test() {

    const result = calculateSum(1, 2);
    console.log(result);
}`;
    
    // 评论原本在第2行（const result = calculateSum(1, 2);）
    const comment = {
        anchor: {
            codeSnippet: 'const result = calculateSum(1, 2);',
            originalRange: {
                startLine: 1,  // 原来在第2行（0-based index = 1）
                startCharacter: 4,
                endLine: 1,
                endCharacter: 35
            },
            beforeContext: 'function test() {',
            afterContext: 'console.log(result);',
            status: 'valid'
        },
        text: '这里计算结果',
        id: 'test-comment'
    };
    
    console.log('原始代码:');
    originalCode.split('\n').forEach((line, i) => {
        const marker = i === 1 ? ' 👈 评论在这里' : '';
        console.log(`${i + 1}: ${line}${marker}`);
    });
    
    console.log('\n用户按回车键后的代码:');
    const modifiedLines = modifiedCode.split('\n');
    modifiedLines.forEach((line, i) => {
        const marker = i === 2 ? ' 👈 评论应该在这里' : '';
        console.log(`${i + 1}: ${line}${marker}`);
    });
    
    // 验证评论位置
    const result = tracker.validateCommentPosition(modifiedLines, comment);
    
    console.log(`\n🎯 最终结果: ${result.anchor.status === 'valid' ? '✅ 成功保持评论有效' : '❌ 评论失效'}`);
    
    if (result.anchor.status === 'valid') {
        const newLine = result.anchor.originalRange.startLine + 1;
        console.log(`📍 评论位置已自动调整到第 ${newLine} 行`);
    }
}

testFixedLineAdjustment();
