// 最新版本的定位算法测试（与改进后的TypeScript代码一致）

class UpdatedPositionTracker {
    findNewPosition(lines, anchor) {
        const codeSnippet = anchor.codeSnippet.trim();
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        
        console.log(`\n🔍 开始搜索代码片段: "${codeSnippet}"`);
        console.log(`📝 前置上下文: "${beforeContext}"`);
        console.log(`📝 后置上下文: "${afterContext}"`);
        
        // 搜索策略1：完整匹配（代码片段 + 上下文）
        console.log('\n策略1: 完整匹配 + 更灵活的上下文验证');
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            
            // 必须是精确的代码片段匹配
            if (currentLine.trim() === codeSnippet.trim()) {
                console.log(`✓ 在第 ${i + 1} 行找到精确匹配: "${currentLine.trim()}"`);
                
                let contextScore = 0;
                let beforeMatch = false;
                let afterMatch = false;
                
                // 检查前面的上下文（更灵活的搜索范围）
                if (beforeContext && i > 0) {
                    console.log('  检查前置上下文（扩大搜索范围）:');
                    for (let j = Math.max(0, i - 5); j < i; j++) {
                        const contextLine = lines[j].trim();
                        console.log(`    第 ${j + 1} 行: "${contextLine}"`);
                        
                        if (contextLine.includes(beforeContext) || beforeContext.includes(contextLine)) {
                            console.log(`    ✓ 直接匹配前置上下文!`);
                            contextScore += 0.5;
                            beforeMatch = true;
                            break;
                        }
                        
                        // 检查关键词匹配
                        const beforeKeywords = beforeContext.split(/\s+/).filter(w => w.length > 3);
                        const lineKeywords = contextLine.split(/\s+/).filter(w => w.length > 3);
                        const commonKeywords = beforeKeywords.filter(kw => lineKeywords.some(lw => lw.includes(kw)));
                        
                        if (beforeKeywords.length > 0 && commonKeywords.length >= beforeKeywords.length * 0.7) {
                            console.log(`    ✓ 关键词匹配前置上下文! (${commonKeywords.length}/${beforeKeywords.length})`);
                            contextScore += 0.3;
                            beforeMatch = true;
                            break;
                        }
                    }
                }
                
                // 检查后面的上下文
                if (afterContext && i < lines.length - 1) {
                    console.log('  检查后置上下文:');
                    const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n').trim();
                    console.log(`    后续内容: "${actualAfter}"`);
                    if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                        console.log(`    ✓ 后置上下文匹配!`);
                        contextScore += 0.5;
                        afterMatch = true;
                    }
                }
                
                console.log(`  上下文得分: ${contextScore}, 前置匹配: ${beforeMatch}, 后置匹配: ${afterMatch}`);
                
                // 提高匹配要求：需要至少一个上下文匹配，且总分≥0.5
                if (contextScore >= 0.5 && (beforeMatch || afterMatch)) {
                    const startChar = currentLine.indexOf(codeSnippet.trim());
                    const confidence = Math.min(1.0, 0.6 + contextScore);
                    console.log(`🎯 找到合适位置! 第 ${i + 1} 行，置信度: ${confidence}`);
                    return {
                        range: {
                            startLine: i,
                            startCharacter: startChar,
                            endLine: i,
                            endCharacter: startChar + codeSnippet.trim().length
                        },
                        confidence: confidence
                    };
                } else {
                    console.log(`  ❌ 上下文验证失败，跳过此位置`);
                }
            }
        }
        
        console.log('\n策略2: 模糊匹配（提高置信度计算）');
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
                            // 提高模糊匹配的置信度计算
                            let confidenceBonus = 0;
                            if (matchRatio >= 0.9) confidenceBonus = 0.1;  // 90%以上匹配给予奖励
                            if (matchCount >= 3) confidenceBonus += 0.05;  // 多关键词匹配奖励
                            
                            const confidence = Math.min(0.8, matchRatio * 0.8 + confidenceBonus);
                            console.log(`🎯 模糊匹配成功! 第 ${i + 1} 行，置信度: ${confidence}`);
                            return {
                                range: {
                                    startLine: i,
                                    startCharacter: 0,
                                    endLine: i,
                                    endCharacter: currentLine.length
                                },
                                confidence: confidence
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
        console.log(`  置信度: ${Math.round(confidence * 100)}%`);
        
        // 调整置信度要求：对于明确的代码匹配，可以接受较低的置信度
        if (confidence < 0.6) {
            console.log(`  ❌ 置信度不足 (最低要求: 60%)`);
            return false;
        }
        
        const lineDistance = Math.abs(newRange.startLine - originalRange.startLine);
        console.log(`  移动距离: ${lineDistance} 行`);
        
        // 限制最大移动距离为15行
        if (lineDistance > 15) {
            console.log(`  ❌ 移动距离过大 (最大允许: 15行)`);
            return false;
        }
        
        // 根据移动距离调整置信度要求
        if (lineDistance <= 3) {
            console.log(`  ✅ 短距离移动，置信度足够`);
            return confidence >= 0.6;
        } else if (lineDistance <= 8) {
            if (confidence >= 0.7) {
                console.log(`  ✅ 中等距离移动，置信度足够`);
                return true;
            } else {
                console.log(`  ❌ 中等距离移动需要更高置信度 (≥70%)`);
                return false;
            }
        } else {
            if (confidence >= 0.8) {
                console.log(`  ✅ 远距离移动，置信度足够`);
                return true;
            } else {
                console.log(`  ❌ 远距离移动需要更高置信度 (≥80%)`);
                return false;
            }
        }
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

// 运行测试
function runUpdatedTest() {
    console.log('=== 更新后的定位算法测试 ===');
    
    const tracker = new UpdatedPositionTracker();
    const modifiedLines = modifiedCode.split('\n');
    
    console.log('\n修改后的代码:');
    modifiedLines.forEach((line, index) => {
        console.log(`${index + 1}: ${line}`);
    });
    
    // 测试findNewPosition方法
    const newPosition = tracker.findNewPosition(modifiedLines, mockComment.anchor);
    
    if (newPosition) {
        console.log('\n✅ 找到新位置');
        const isReasonable = tracker.isPositionChangeReasonable(
            mockComment.anchor.originalRange, 
            newPosition.range, 
            newPosition.confidence
        );
        
        console.log(`\n🎯 最终结果: ${isReasonable ? '✅ 成功重新定位' : '❌ 拒绝新位置'}`);
        
        if (isReasonable) {
            console.log(`📍 新位置: 第 ${newPosition.range.startLine + 1} 行`);
            console.log(`📊 置信度: ${Math.round(newPosition.confidence * 100)}%`);
            console.log(`📏 移动距离: ${Math.abs(newPosition.range.startLine - mockComment.anchor.originalRange.startLine)} 行`);
        }
        
    } else {
        console.log('\n❌ 未找到新位置');
    }
}

runUpdatedTest();
