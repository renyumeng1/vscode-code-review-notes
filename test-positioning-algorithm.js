// 独立的定位算法测试脚本（不依赖VS Code API）

// 提取并简化核心定位算法
class PositionTracker {
    /**
     * 检查原始位置是否仍然有效
     */
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
    
    /**
     * 从行数组中提取代码片段
     */
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
    
    /**
     * 重新定位评论
     */
    findNewPosition(lines, anchor) {
        const codeSnippet = anchor.codeSnippet.trim();
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        
        // 搜索策略1：精确匹配 + 上下文验证
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            
            // 必须完全匹配代码片段（而不是包含）
            if (currentLine.trim() === codeSnippet || currentLine.includes(codeSnippet)) {
                let contextScore = 0;
                let beforeMatch = false;
                let afterMatch = false;
                
                // 验证上下文
                if (beforeContext && i > 0) {
                    for (let j = Math.max(0, i - 3); j < i; j++) {
                        if (lines[j].includes(beforeContext) || beforeContext.includes(lines[j].trim())) {
                            contextScore += 0.5;
                            beforeMatch = true;
                        }
                    }
                }
                
                if (afterContext && i < lines.length - 1) {
                    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
                        if (lines[j].includes(afterContext) || afterContext.includes(lines[j].trim())) {
                            contextScore += 0.5;
                            afterMatch = true;
                        }
                    }
                }
                
                // 更严格的匹配要求：需要两个上下文都匹配
                if (contextScore >= 1.0 && beforeMatch && afterMatch) {
                    const startChar = currentLine.indexOf(codeSnippet);
                    return {
                        range: {
                            startLine: i,
                            startCharacter: startChar,
                            endLine: i,
                            endCharacter: startChar + codeSnippet.length
                        },
                        confidence: Math.min(1.0, 0.4 + contextScore)
                    };
                }
            }
        }
        
        // 搜索策略2：模糊匹配（严格限制）
        if (codeSnippet.length > 10) {
            const keywords = codeSnippet.split(/\s+/).filter(word => word.length > 3);
            
            if (keywords.length >= 2) {
                for (let i = 0; i < lines.length; i++) {
                    const currentLine = lines[i];
                    let matchCount = 0;
                    
                    for (const keyword of keywords) {
                        if (currentLine.includes(keyword)) {
                            matchCount++;
                        }
                    }
                    
                    // 大幅提高匹配要求：需要80%的关键词匹配
                    const matchRatio = matchCount / keywords.length;
                    if (matchRatio >= 0.8 && matchCount >= 2) {
                        // 额外验证：检查是否有上下文支持
                        let contextSupport = false;
                        
                        if (beforeContext && i > 0) {
                            const actualBefore = lines.slice(Math.max(0, i - 1), i).join('\n').trim();
                            if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                                contextSupport = true;
                            }
                        }
                        
                        if (afterContext && i < lines.length - 1) {
                            const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 2)).join('\n').trim();
                            if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                                contextSupport = true;
                            }
                        }
                        
                        // 只有在有上下文支持时才返回模糊匹配结果
                        if (contextSupport) {
                            return {
                                range: {
                                    startLine: i,
                                    startCharacter: 0,
                                    endLine: i,
                                    endCharacter: currentLine.length
                                },
                                confidence: Math.min(0.6, matchRatio * 0.7)  // 降低模糊匹配的置信度
                            };
                        }
                    }
                }
            }
        }
        
        return null;
    }
    
    /**
     * 检查位置变化是否合理
     */
    isPositionChangeReasonable(originalRange, newRange, confidence) {
        // 置信度必须足够高
        if (confidence < 0.8) {
            return false;
        }
        
        // 计算移动距离（以行为单位）
        const lineDistance = Math.abs(newRange.startLine - originalRange.startLine);
        
        // 限制最大移动距离为10行
        const maxMoveDistance = 10;
        if (lineDistance > maxMoveDistance) {
            return false;
        }
        
        // 如果移动距离很大，需要更高的置信度
        if (lineDistance > 5 && confidence < 0.9) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 验证评论位置
     */
    validateCommentPositions(lines, comments) {
        return comments.map(comment => {
            const anchor = comment.anchor;
            
            // 1. 检查原始位置是否还有效
            if (this.isOriginalPositionValid(lines, anchor)) {
                return {
                    ...comment,
                    anchor: {
                        ...anchor,
                        status: 'valid',
                        lastValidatedAt: Date.now()
                    }
                };
            }
            
            // 2. 尝试重新定位
            const newPosition = this.findNewPosition(lines, anchor);
            
            if (newPosition && this.isPositionChangeReasonable(anchor.originalRange, newPosition.range, newPosition.confidence)) {
                return {
                    ...comment,
                    anchor: {
                        ...anchor,
                        status: 'moved',
                        currentRange: newPosition.range,
                        confidence: newPosition.confidence,
                        lastValidatedAt: Date.now()
                    }
                };
            }
            
            // 3. 标记为可能删除
            return {
                ...comment,
                anchor: {
                    ...anchor,
                    status: 'deleted',
                    lastValidatedAt: Date.now()
                }
            };
        });
    }
}

// 测试数据
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

// 创建模拟的评论
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

// 运行测试
function runTest() {
    console.log('=== 智能评论位置跟踪算法测试 ===\n');
    
    const tracker = new PositionTracker();
    const originalLines = originalCode.split('\n');
    const modifiedLines = modifiedCode.split('\n');
    
    console.log('原始代码:');
    originalLines.forEach((line, index) => {
        const marker = index === mockComment.anchor.originalRange.startLine ? ' 👈 评论在这里' : '';
        console.log(`${index + 1}: ${line}${marker}`);
    });
    
    console.log('\n修改后的代码:');
    modifiedLines.forEach((line, index) => {
        console.log(`${index + 1}: ${line}`);
    });
    
    console.log('\n=== 开始重新定位 ===\n');
    
    const updatedComments = tracker.validateCommentPositions(modifiedLines, [mockComment]);
    const updatedComment = updatedComments[0];
    
    console.log('定位结果:');
    console.log(`状态: ${updatedComment.anchor.status}`);
    
    if (updatedComment.anchor.status === 'moved') {
        const newRange = updatedComment.anchor.currentRange;
        const originalLine = mockComment.anchor.originalRange.startLine + 1;
        const newLine = newRange.startLine + 1;
        
        console.log(`原位置: 第 ${originalLine} 行`);
        console.log(`新位置: 第 ${newLine} 行`);
        console.log(`置信度: ${Math.round(updatedComment.anchor.confidence * 100)}%`);
        
        // 验证新位置的代码
        const foundCode = modifiedLines[newRange.startLine].substring(
            newRange.startCharacter, 
            newRange.endCharacter
        );
        console.log(`找到的代码: "${foundCode}"`);
        
        // 计算移动距离
        const moveDistance = Math.abs(newRange.startLine - mockComment.anchor.originalRange.startLine);
        console.log(`移动距离: ${moveDistance} 行`);
        
        // 显示新位置在修改后代码中的上下文
        console.log('\n新位置的上下文:');
        for (let i = Math.max(0, newRange.startLine - 1); i <= Math.min(modifiedLines.length - 1, newRange.startLine + 1); i++) {
            const marker = i === newRange.startLine ? ' 👈 评论新位置' : '';
            console.log(`${i + 1}: ${modifiedLines[i]}${marker}`);
        }
        
    } else if (updatedComment.anchor.status === 'valid') {
        console.log('✅ 评论位置仍然有效，无需移动');
    } else {
        console.log('⚠️ 未能找到合适的新位置，评论可能已失效');
    }
    
    console.log('\n=== 测试完成 ===');
}

// 运行测试
runTest();
