// 详细调试版本的定位算法测试

class DebugPositionTracker {
    findNewPosition(lines, anchor) {
        const codeSnippet = anchor.codeSnippet.trim();
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        
        console.log(`\n🔍 开始搜索代码片段: "${codeSnippet}"`);
        console.log(`📝 前置上下文: "${beforeContext}"`);
        console.log(`📝 后置上下文: "${afterContext}"`);
        
        // 搜索策略1：精确匹配 + 上下文验证
        console.log('\n策略1: 精确匹配 + 上下文验证');
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            
            // 检查是否包含代码片段
            if (currentLine.includes(codeSnippet)) {
                console.log(`✓ 在第 ${i + 1} 行找到匹配: "${currentLine.trim()}"`);
                
                let contextScore = 0;
                let beforeMatch = false;
                let afterMatch = false;
                
                // 验证前置上下文
                if (beforeContext && i > 0) {
                    console.log('  检查前置上下文:');
                    for (let j = Math.max(0, i - 3); j < i; j++) {
                        const testLine = lines[j].trim();
                        console.log(`    第 ${j + 1} 行: "${testLine}"`);
                        if (lines[j].includes(beforeContext) || beforeContext.includes(testLine)) {
                            console.log(`    ✓ 前置上下文匹配!`);
                            contextScore += 0.5;
                            beforeMatch = true;
                        }
                    }
                }
                
                // 验证后置上下文
                if (afterContext && i < lines.length - 1) {
                    console.log('  检查后置上下文:');
                    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
                        const testLine = lines[j].trim();
                        console.log(`    第 ${j + 1} 行: "${testLine}"`);
                        if (lines[j].includes(afterContext) || afterContext.includes(testLine)) {
                            console.log(`    ✓ 后置上下文匹配!`);
                            contextScore += 0.5;
                            afterMatch = true;
                        }
                    }
                }
                
                console.log(`  上下文得分: ${contextScore}, 前置匹配: ${beforeMatch}, 后置匹配: ${afterMatch}`);
                
                // 更严格的匹配要求：需要两个上下文都匹配
                if (contextScore >= 1.0 && beforeMatch && afterMatch) {
                    const startChar = currentLine.indexOf(codeSnippet);
                    console.log(`🎯 找到合适位置! 第 ${i + 1} 行，置信度: ${Math.min(1.0, 0.4 + contextScore)}`);
                    return {
                        range: {
                            startLine: i,
                            startCharacter: startChar,
                            endLine: i,
                            endCharacter: startChar + codeSnippet.length
                        },
                        confidence: Math.min(1.0, 0.4 + contextScore)
                    };
                } else {
                    console.log(`  ❌ 上下文验证失败，跳过此位置`);
                }
            }
        }
        
        console.log('\n策略2: 模糊匹配（严格限制）');
        if (codeSnippet.length > 10) {
            const keywords = codeSnippet.split(/\s+/).filter(word => word.length > 3);
            console.log(`关键词: [${keywords.join(', ')}]`);
            
            if (keywords.length >= 2) {
                for (let i = 0; i < lines.length; i++) {
                    const currentLine = lines[i];
                    let matchCount = 0;
                    
                    for (const keyword of keywords) {
                        if (currentLine.includes(keyword)) {
                            matchCount++;
                        }
                    }
                    
                    const matchRatio = matchCount / keywords.length;
                    if (matchRatio >= 0.8 && matchCount >= 2) {
                        console.log(`🔍 第 ${i + 1} 行模糊匹配 (${Math.round(matchRatio * 100)}%): "${currentLine.trim()}"`);
                        
                        // 检查上下文支持
                        let contextSupport = false;
                        
                        if (beforeContext && i > 0) {
                            const actualBefore = lines.slice(Math.max(0, i - 1), i).join('\n').trim();
                            if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                                contextSupport = true;
                                console.log(`  ✓ 前置上下文支持`);
                            }
                        }
                        
                        if (afterContext && i < lines.length - 1) {
                            const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 2)).join('\n').trim();
                            if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                                contextSupport = true;
                                console.log(`  ✓ 后置上下文支持`);
                            }
                        }
                        
                        if (contextSupport) {
                            console.log(`🎯 模糊匹配成功! 第 ${i + 1} 行`);
                            return {
                                range: {
                                    startLine: i,
                                    startCharacter: 0,
                                    endLine: i,
                                    endCharacter: currentLine.length
                                },
                                confidence: Math.min(0.6, matchRatio * 0.7)
                            };
                        } else {
                            console.log(`  ❌ 缺乏上下文支持，跳过`);
                        }
                    }
                }
            }
        }
        
        console.log('❌ 未找到合适的位置');
        return null;
    }
    
    isPositionChangeReasonable(originalRange, newRange, confidence) {
        console.log(`\n🔧 检查位置变化合理性:`);
        console.log(`  置信度: ${Math.round(confidence * 100)}% (要求: ≥80%)`);
        
        if (confidence < 0.8) {
            console.log(`  ❌ 置信度不足`);
            return false;
        }
        
        const lineDistance = Math.abs(newRange.startLine - originalRange.startLine);
        console.log(`  移动距离: ${lineDistance} 行 (最大允许: 10行)`);
        
        if (lineDistance > 10) {
            console.log(`  ❌ 移动距离过大`);
            return false;
        }
        
        if (lineDistance > 5 && confidence < 0.9) {
            console.log(`  ❌ 大距离移动需要更高置信度 (≥90%)`);
            return false;
        }
        
        console.log(`  ✅ 位置变化合理`);
        return true;
    }
}

// 测试数据
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
        confidence: 1.0
    },
    text: '这里计算两个数的和',
    id: 'test-comment-1'
};

// 运行详细调试
function runDetailedTest() {
    console.log('=== 详细调试测试 ===');
    
    const tracker = new DebugPositionTracker();
    const modifiedLines = modifiedCode.split('\n');
    
    console.log('\n修改后的代码:');
    modifiedLines.forEach((line, index) => {
        console.log(`${index + 1}: ${line}`);
    });
    
    // 直接测试findNewPosition方法
    const newPosition = tracker.findNewPosition(modifiedLines, mockComment.anchor);
    
    if (newPosition) {
        console.log('\n✅ 找到新位置');
        const isReasonable = tracker.isPositionChangeReasonable(
            mockComment.anchor.originalRange, 
            newPosition.range, 
            newPosition.confidence
        );
        
        console.log(`\n最终结果: ${isReasonable ? '✅ 接受新位置' : '❌ 拒绝新位置'}`);
    } else {
        console.log('\n❌ 未找到新位置');
    }
}

runDetailedTest();
