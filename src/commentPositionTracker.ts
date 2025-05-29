import * as vscode from 'vscode';
import { Comment, CommentAnchor, CommentRange } from './types';

/**
 * 评论位置追踪器
 * 负责智能跟踪评论位置，处理代码删除/移动等情况
 */
export class CommentPositionTracker {
    private static readonly MAX_SKIPS_BETWEEN_ORIGINAL_LINES = 3; // 在寻找下一条原始代码行时，最多可以跳过多少当前文档的行

    private disposables: vscode.Disposable[] = [];
    private documentChangeHandlers: Map<string, NodeJS.Timeout> = new Map();
    private silentMode: boolean = true;
    
    // 新增：文档状态缓存，用于对比变化
    private documentStateCache: Map<string, {
        lineCount: number;
        contentHash: string;
        lastModified: number;
    }> = new Map();
    
    // 新增：评论位置缓存，用于快速定位
    private commentPositionCache: Map<string, Map<string, CommentAnchor>> = new Map();// 静默模式，不显示通知
      constructor() {
        this.setupSilentRealTimeMonitoring();
        this.setupAdvancedChangeDetection();
    }
    
    /**
     * 设置静默实时监控 - 后台运行，不通知用户
     */
    private setupSilentRealTimeMonitoring() {
        // 监听文档内容变化
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                this.handleDocumentChangeSilent(e);
            })
        );
        
        // 监听文档保存
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(document => {
                this.validateDocumentCommentsSilent(document);
            })
        );
        
        // 监听编辑器切换
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor) {
                    this.validateDocumentCommentsSilent(editor.document);
                }
            })
        );
    }    /**
     * 静默处理文档变化 - 增强版，监控所有类型的代码变化
     */
    private handleDocumentChangeSilent(event: vscode.TextDocumentChangeEvent) {
        const document = event.document;
        const uri = document.uri.fsPath;
        
        // 清除之前的定时器
        const existingTimeout = this.documentChangeHandlers.get(uri);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        // 分析所有类型的变化
        const changeAnalysis = this.analyzeAllDocumentChanges(event);
        
        // 根据变化类型设置不同的响应延迟
        let delay;
        if (changeAnalysis.isEnterKey) {
            delay = 10; // Enter键：立即响应
        } else if (changeAnalysis.hasLineInsertion || changeAnalysis.hasLineDeletion) {
            delay = 50; // 其他行级变化：快速响应
        } else if (changeAnalysis.hasLargeChange) {
            delay = 200; // 大量变化（粘贴、替换）：稍微延迟
        } else {
            delay = 400; // 小的内容变化：较长延迟
        }
        
        // 记录变化用于调试
        if (!this.silentMode) {
            console.log(`文档变化检测: ${changeAnalysis.changeType}, 延迟: ${delay}ms`);
        }
        
        // 设置新的定时器
        const timeout = setTimeout(() => {
            this.processAdvancedDocumentChange(document, changeAnalysis);
            this.documentChangeHandlers.delete(uri);
        }, delay);
        
        this.documentChangeHandlers.set(uri, timeout);
    }
    
    /**
     * 分析所有类型的文档变化
     */
    private analyzeAllDocumentChanges(event: vscode.TextDocumentChangeEvent): {
        isEnterKey: boolean;
        isDeleteKey: boolean;
        hasLineInsertion: boolean;
        hasLineDeletion: boolean;
        hasLargeChange: boolean;
        hasMultiLineChange: boolean;
        changeType: 'enter' | 'delete' | 'paste' | 'cut' | 'type' | 'replace' | 'mixed';
        totalChangedChars: number;
        affectedLineRange: { start: number; end: number };
        netLineChange: number; // 新增：净行数变化
        changeStartLine: number; // 新增：变化起始行
    } {
        let isEnterKey = false;
        let isDeleteKey = false;
        let hasLineInsertion = false;
        let hasLineDeletion = false;
        let totalChangedChars = 0;
        let minAffectedLine = Number.MAX_SAFE_INTEGER;
        let maxAffectedLine = 0;
        let netLineChange = 0;
        let changeStartLine = Number.MAX_SAFE_INTEGER;
        
        // 分析每个变化
        for (const change of event.contentChanges) {
            const newLineCount = (change.text.match(/\n/g) || []).length;
            const deletedLineCount = change.range.end.line - change.range.start.line;

            // 计算净行数变化和变化起始行
            const insertedLinesInChange = newLineCount; // newLineCount 已经是插入的换行符数量
            const deletedLinesInChange = deletedLineCount;
            netLineChange += insertedLinesInChange - deletedLinesInChange;
            changeStartLine = Math.min(changeStartLine, change.range.start.line);
            
            // 检测Enter键：单个换行符插入，无删除
            if (change.text === '\n' && change.rangeLength === 0 && event.contentChanges.length === 1) {
                isEnterKey = true;
            }
            
            // 检测删除键：只删除不插入，或删除后插入较少内容
            if (change.rangeLength > 0 && change.text.length === 0) {
                isDeleteKey = true;
            }
            
            // 检测行插入（Enter、粘贴多行等）
            if (insertedLinesInChange > 0) { // 使用 insertedLinesInChange
                hasLineInsertion = true;
            }
            
            // 检测行删除（删除键、剪切等）
            if (deletedLinesInChange > 0 || (change.rangeLength > 0 && insertedLinesInChange === 0)) { // 使用 deletedLinesInChange 和 insertedLinesInChange
                hasLineDeletion = true;
            }
            
            // 统计变化范围
            minAffectedLine = Math.min(minAffectedLine, change.range.start.line);
            maxAffectedLine = Math.max(maxAffectedLine, change.range.end.line + insertedLinesInChange); // 使用 insertedLinesInChange
            
            totalChangedChars += change.text.length + change.rangeLength;
        }
        
        // 判断变化类型
        let changeType: 'enter' | 'delete' | 'paste' | 'cut' | 'type' | 'replace' | 'mixed' = 'type';
        
        if (isEnterKey) {
            changeType = 'enter';
        } else if (isDeleteKey && !hasLineInsertion) {
            changeType = 'delete';
        } else if (totalChangedChars > 50 && hasLineInsertion) {
            changeType = 'paste';
        } else if (hasLineDeletion && totalChangedChars > 20) {
            changeType = 'cut';
        } else if (hasLineInsertion && hasLineDeletion) {
            changeType = 'replace';
        } else if (event.contentChanges.length > 1) {
            changeType = 'mixed';
        }
        
        return {
            isEnterKey,
            isDeleteKey,
            hasLineInsertion,
            hasLineDeletion,
            hasLargeChange: totalChangedChars > 100,
            hasMultiLineChange: hasLineInsertion || hasLineDeletion,
            changeType,
            totalChangedChars,
            affectedLineRange: {
                start: minAffectedLine === Number.MAX_SAFE_INTEGER ? 0 : minAffectedLine,
                end: maxAffectedLine
            },
            netLineChange,
            changeStartLine: changeStartLine === Number.MAX_SAFE_INTEGER && event.contentChanges.length > 0
                             ? event.contentChanges[0].range.start.line
                             : (changeStartLine === Number.MAX_SAFE_INTEGER ? 0 : changeStartLine)
        };
    }
    
    /**
     * 处理高级文档变化
     */
    private async processAdvancedDocumentChange(
        document: vscode.TextDocument,
        changeAnalysis: any
    ): Promise<void> {
        try {
            // 更新文档状态缓存
            this.updateDocumentCache(document);
            
            // 如果有评论缓存，更新相关评论的上下文
            if (changeAnalysis.hasMultiLineChange) {
                await this.updateCommentContextsForChanges(document, changeAnalysis);
            }
            
            // 通知需要静默验证
            if (this.onSilentValidationNeeded) {
                this.onSilentValidationNeeded(document);
            }
            
        } catch (error) {
            console.error('处理高级文档变化时出错:', error);
        }
    }
    
    /**
     * 为变化更新评论上下文
     */
    private async updateCommentContextsForChanges(
        document: vscode.TextDocument,
        changeAnalysis: any
    ): Promise<void> {
        const uri = document.uri.toString();
        const commentCache = this.commentPositionCache.get(uri);
        
        if (!commentCache || commentCache.size === 0) {
            return;
        }
        
        const lines = document.getText().split('\n');
        const affectedRange = changeAnalysis.affectedLineRange;
        const netLineChange = changeAnalysis.netLineChange;
        const changeStartLine = changeAnalysis.changeStartLine;

        // 首先，直接调整受影响的评论行号
        if (netLineChange !== 0) {
            commentCache.forEach(anchor => {
                if (anchor.originalRange.startLine >= changeStartLine) {
                    anchor.originalRange.startLine = Math.max(0, anchor.originalRange.startLine + netLineChange);
                    anchor.originalRange.endLine = Math.max(0, anchor.originalRange.endLine + netLineChange);
                }
            });
        }
        
        // 只更新受影响范围内或附近的评论
        for (const [commentId, anchor] of commentCache.entries()) {
            const range = anchor.originalRange;
            
            // 检查评论是否在受影响的范围内或附近（±5行）
            const isNearAffectedArea = 
                range.startLine >= affectedRange.start - 5 && 
                range.startLine <= affectedRange.end + 5;
            
            if (isNearAffectedArea) {
                try {
                    // 重新计算该评论的上下文
                    const updatedAnchor = await this.recalculateCommentContext(
                        document, anchor, lines, changeAnalysis
                    );
                    commentCache.set(commentId, updatedAnchor);
                } catch (error) {
                    console.error(`更新评论 ${commentId} 上下文时出错:`, error);
                }
            }
        }
    }
    
    /**
     * 重新计算单个评论的上下文
     */
    private async recalculateCommentContext(
        document: vscode.TextDocument,
        anchor: CommentAnchor,
        lines: string[], // 当前文档的行
        changeAnalysis: any // 可选，如果需要更细致的调整
    ): Promise<CommentAnchor> {
        const originalRange = anchor.originalRange; // 这是上一次已知的位置

        // 检查上一次已知位置是否仍然有效
        // 检查上一次已知位置是否仍然有效。
        // 注意：isOriginalPositionValid 会比较当前文档在 originalRange 的片段与 anchor.codeSnippet。
        // 如果代码片段内部有修改，isOriginalPositionValid 会返回 false，从而触发后续的 findNewPosition 逻辑。
        // findNewPosition 应该能够找到修改后的代码（即使范围不变），然后 createAnchor 会重新生成所有信息。
        // 因此，这里的 if 分支主要处理行号可能已通过 tryAdjustLineOffset 调整，但代码片段内容未变的情况。
        // 或者是代码片段和行号都未变的情况。
        // 无论哪种情况，如果 originalRange 被认为是有效的，我们都应该基于这个 originalRange 重新提取所有数据。
        if (this.isOriginalPositionValid(lines, anchor)) {
            // 位置有效（行号可能已调整，也可能未调整），并且当前文档在该位置的代码片段与存储的 codeSnippet 匹配。
            // 这意味着代码片段本身没有变化，但其上下文可能因周围代码的增删而改变。
            // 或者，这是一个新创建的、尚未移动的评论的初次验证。
            // 我们需要确保 codeSnippet, beforeContext, 和 afterContext 都从当前文档状态更新。
            const currentActualSnippet = this.extractSnippetFromLines(lines, originalRange); // 重新提取以确保
            const beforeLinesCount = 2; // 与 createAnchor 保持一致
            const afterLinesCount = 2;  // 与 createAnchor 保持一致
            
            const beforeContext = lines
                .slice(Math.max(0, originalRange.startLine - beforeLinesCount), originalRange.startLine)
                .join('\n');
                
            const afterContext = lines
                .slice(originalRange.endLine + 1, Math.min(lines.length, originalRange.endLine + afterLinesCount + 1))
                .join('\n');
            
            return {
                ...anchor,
                originalRange: originalRange, // originalRange 自身在此分支中被认为是有效的
                codeSnippet: currentActualSnippet,
                beforeContext,
                afterContext,
                status: 'valid',
                lastValidatedAt: Date.now(),
                currentRange: undefined, // 如果之前是 'moved'，现在回到 'valid'，清除这些字段
                confidence: undefined
            };
        }
        
        // 位置无效或代码片段不匹配，尝试重新定位
        const newPosition = this.findNewPosition(lines, anchor); // 使用旧 anchor 搜索
        if (newPosition && this.isPositionChangeReasonable(anchor.originalRange, newPosition.range, newPosition.confidence)) {
            const newVsCodeRange = new vscode.Range(
                newPosition.range.startLine, newPosition.range.startCharacter,
                newPosition.range.endLine, newPosition.range.endCharacter
            );
            // 使用 createAnchor 从新位置创建全新的锚点
            const newAnchorFull = await this.createAnchor(document, newVsCodeRange);
            return {
                ...newAnchorFull, // 包含新的 snippet, range, context
                status: 'moved',
                currentRange: newPosition.range, // 明确移动后的位置
                confidence: newPosition.confidence,
                lastValidatedAt: Date.now()
            };
        }
        
        // 无法重新定位，标记为已删除
        return {
            ...anchor,
            status: 'deleted',
            lastValidatedAt: Date.now()
        };
    }
    
    /**
     * 更新文档状态缓存
     */
    private updateDocumentCache(document: vscode.TextDocument) {
        const uri = document.uri.toString();
        const content = document.getText();
        const lineCount = document.lineCount;
        
        // 简单的内容哈希
        const contentHash = this.simpleHash(content);
        
        this.documentStateCache.set(uri, {
            lineCount,
            contentHash,
            lastModified: Date.now()
        });
    }
    
    /**
     * 简单哈希函数
     */
    private simpleHash(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return hash.toString();
    }
    
    /**
     * 静默验证文档评论 - 在后台运行，不打扰用户
     */
    private async validateDocumentCommentsSilent(document: vscode.TextDocument) {
        try {
            // 这里需要访问CommentService，我们将在extension.ts中注入
            // 为了现在的实现，我们发出一个自定义事件
            this.onSilentValidationNeeded?.(document);
        } catch (error) {
            // 静默处理错误，不显示给用户
            console.debug('Silent comment validation error:', error);
        }
    }
    
    /**
     * 回调函数，用于通知需要静默验证
     */
    public onSilentValidationNeeded?: (document: vscode.TextDocument) => void;
    
    /**
     * 设置静默模式
     */
    public setSilentMode(silent: boolean) {
        this.silentMode = silent;
    }
    
    /**
     * 创建评论锚点，包含上下文信息
     */
    async createAnchor(
        document: vscode.TextDocument,
        range: vscode.Range // vscode.Range 本身就能表示多行
    ): Promise<CommentAnchor> {
        const text = document.getText();
        const lines = text.split('\n');
        
        const beforeLinesCount = 2;
        const afterLinesCount = 2;
        
        const beforeContext = lines
            .slice(Math.max(0, range.start.line - beforeLinesCount), range.start.line)
            .join('\n');
            
        const afterContext = lines
            .slice(range.end.line + 1, Math.min(lines.length, range.end.line + afterLinesCount + 1))
            .join('\n');
            
        const codeSnippet = document.getText(range);
        
        return {
            originalRange: {
                startLine: range.start.line,
                startCharacter: range.start.character,
                endLine: range.end.line,
                endCharacter: range.end.character
            },
            beforeContext,
            afterContext,
            codeSnippet,
            status: 'valid',
            lastValidatedAt: Date.now()
        };
    }
    
    /**
     * 验证并更新评论位置
     */
    async validateCommentPositions(
        document: vscode.TextDocument,
        comments: Comment[]
    ): Promise<Comment[]> {
        const text = document.getText();
        const lines = text.split('\n');

        const updatedCommentsPromises = comments.map(async comment => {
            let anchor = comment.anchor;
            
            // 1. 尝试智能行号调整
            const adjustedAnchorAttempt = this.tryAdjustLineOffset(lines, { ...anchor });

            // 2. 检查调整后的位置是否有效
            if (this.isOriginalPositionValid(lines, adjustedAnchorAttempt)) {
                const validRange = adjustedAnchorAttempt.originalRange;
                const currentActualSnippet = this.extractSnippetFromLines(lines, validRange);
                const beforeLinesCount = 2; // Consistent with createAnchor
                const afterLinesCount = 2;  // Consistent with createAnchor

                const beforeContext = lines
                    .slice(Math.max(0, validRange.startLine - beforeLinesCount), validRange.startLine)
                    .join('\n');

                const afterContext = lines
                    .slice(validRange.endLine + 1, Math.min(lines.length, validRange.endLine + afterLinesCount + 1))
                    .join('\n');

                return {
                    ...comment,
                    anchor: {
                        ...anchor, // Preserve other properties of the old anchor like id
                        originalRange: validRange,
                        codeSnippet: currentActualSnippet, // This is already up-to-date
                        beforeContext, // Update beforeContext
                        afterContext,  // Update afterContext
                        status: 'valid' as const,
                        lastValidatedAt: Date.now(),
                        currentRange: undefined, // Clear previous currentRange and confidence
                        confidence: undefined
                    }
                };
            }
            
            // 3. 如果智能调整后仍然无效，尝试重新定位
            const newPosition = this.findNewPosition(lines, anchor);
            
            if (newPosition && this.isPositionChangeReasonable(anchor.originalRange, newPosition.range, newPosition.confidence)) {
                const newVsCodeRange = new vscode.Range(
                    newPosition.range.startLine, newPosition.range.startCharacter,
                    newPosition.range.endLine, newPosition.range.endCharacter
                );
                const newAnchor = await this.createAnchor(document, newVsCodeRange);

                return {
                    ...comment,
                    anchor: {
                        ...newAnchor,
                        status: 'moved' as const,
                        currentRange: newPosition.range,
                        confidence: newPosition.confidence,
                        lastValidatedAt: Date.now()
                    }
                };
            }
            
            // 4. 标记为可能删除
            return {
                ...comment,
                anchor: {
                    ...anchor,
                    status: 'deleted' as const,
                    lastValidatedAt: Date.now()
                }
            };
        });
        return Promise.all(updatedCommentsPromises);
    }
    
    /**
     * 检查原始位置是否仍然有效
     */
    private isOriginalPositionValid(lines: string[], anchor: CommentAnchor): boolean {
        const range = anchor.originalRange;
        
        // 检查行号是否越界
        if (range.startLine > range.endLine ||
            range.startLine < 0 || range.startLine >= lines.length ||
            range.endLine < 0 || range.endLine >= lines.length) {
            return false;
        }
        
        // 检查代码片段是否匹配
        const currentSnippet = this.extractSnippetFromLines(lines, range);
        return currentSnippet.trim() === anchor.codeSnippet.trim();
    }
    
    /**
     * 从行数组中提取代码片段
     */
    private extractSnippetFromLines(lines: string[], range: CommentRange): string {
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
     * 使用上下文重新定位评论
     */
    private findNewPosition(lines: string[], anchor: CommentAnchor):
        { range: CommentRange, confidence: number } | null {

        const originalCodeSnippet = anchor.codeSnippet;
        const codeSnippetLines = originalCodeSnippet.trim().split('\n');
        const isMultiLineSnippet = codeSnippetLines.length > 1;

        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();

        for (let i = 0; i <= lines.length - codeSnippetLines.length; i++) {
            let potentialMatch = true;

            for (let j = 0; j < codeSnippetLines.length; j++) {
                const docLine = lines[i + j];
                const snippetLine = codeSnippetLines[j];
                if (docLine.trim() !== snippetLine.trim()) {
                    potentialMatch = false;
                    break;
                }
            }

            if (potentialMatch) {
                let contextScore = 0;
                let beforeMatch = !beforeContext;
                let afterMatch = !afterContext;

                if (beforeContext && i > 0) {
                    const actualBeforeLines = lines.slice(Math.max(0, i - (anchor.beforeContext?.split('\n').length || 2)), i);
                    const actualBeforeText = actualBeforeLines.join('\n').trim();
                    if (actualBeforeText.includes(beforeContext) || beforeContext.includes(actualBeforeText)) {
                        contextScore += 0.5;
                        beforeMatch = true;
                    }
                } else if (!beforeContext) {
                    contextScore += 0.25;
                }

                const snippetEndLineIndex = i + codeSnippetLines.length - 1;
                if (afterContext && snippetEndLineIndex < lines.length - 1) {
                    const actualAfterLines = lines.slice(snippetEndLineIndex + 1, Math.min(lines.length, snippetEndLineIndex + 1 + (anchor.afterContext?.split('\n').length || 2)));
                    const actualAfterText = actualAfterLines.join('\n').trim();
                    if (actualAfterText.includes(afterContext) || afterContext.includes(actualAfterText)) {
                        contextScore += 0.5;
                        afterMatch = true;
                    }
                } else if (!afterContext) {
                    contextScore += 0.25;
                }
                
                if ((beforeMatch && afterMatch) || (contextScore >= 0.5 && (beforeMatch || afterMatch))) {
                    const firstLineInDoc = lines[i];
                    const lastLineInDoc = lines[snippetEndLineIndex];
                    const firstSnippetLineTrimmed = codeSnippetLines[0].trim();
                    const lastSnippetLineTrimmed = codeSnippetLines[codeSnippetLines.length - 1].trim();

                    let startChar = firstLineInDoc.indexOf(firstSnippetLineTrimmed);
                    if (startChar === -1 && firstSnippetLineTrimmed.length > 0) startChar = firstLineInDoc.indexOf(codeSnippetLines[0]);
                    if (startChar === -1) startChar = 0;

                    let endChar = -1;
                    if (lastSnippetLineTrimmed.length > 0) {
                        endChar = lastLineInDoc.indexOf(lastSnippetLineTrimmed); // Try trimmed first
                        if (endChar !== -1) {
                            endChar += lastSnippetLineTrimmed.length;
                        } else { // Try original if trimmed fails
                            endChar = lastLineInDoc.indexOf(codeSnippetLines[codeSnippetLines.length - 1]);
                             if (endChar !== -1) endChar += codeSnippetLines[codeSnippetLines.length - 1].length;
                        }
                    }
                    if (endChar === -1 || (endChar === 0 && lastSnippetLineTrimmed.length > 0) ) endChar = lastLineInDoc.length;


                    return {
                        range: {
                            startLine: i,
                            startCharacter: startChar,
                            endLine: snippetEndLineIndex,
                            endCharacter: endChar
                        },
                        confidence: Math.min(1.0, 0.7 + contextScore * 0.3)
                    };
                }
            }
        }
 
        // NEW: Try to find evolved multi-line position if exact match failed
        if (isMultiLineSnippet) { // Only if it was a multi-line snippet originally
            const evolvedPosition = this._findEvolvedMultiLinePosition(lines, anchor, codeSnippetLines, beforeContext, afterContext);
            if (evolvedPosition) {
                return evolvedPosition;
            }
            // If evolved search also fails for a multi-line snippet,
            // we might still want to try the single-line logic below,
            // in case the snippet was drastically reduced to a single recognizable line.
        }
 
        // Fallback to original single-line logic.
        // For a multi-line snippet that wasn't found above, codeSnippetLines[0] is its first line.
        // For a single-line snippet, codeSnippetLines[0] is the snippet itself.
        const singleCodeSnippetTrimmed = codeSnippetLines[0].trim();
        // Ensure that we only proceed with single-line logic if there's a valid snippet line to check
        // and either it was originally a single-line snippet OR it was a multi-line snippet that might have been reduced.
        if (singleCodeSnippetTrimmed.length > 0) {
            // Search strategy 1: Exact match for single line
            for (let i = 0; i < lines.length; i++) {
                const currentLine = lines[i];
                if (currentLine.trim() === singleCodeSnippetTrimmed) {
                    let contextScore = 0;
                    let beforeMatch = !beforeContext;
                    let afterMatch = !afterContext;

                    if (beforeContext && i > 0) {
                        const actualBefore = lines.slice(Math.max(0, i - 2), i).join('\n').trim();
                        if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                            contextScore += 0.5; beforeMatch = true;
                        }
                    } else if (!beforeContext) { contextScore += 0.25; }

                    if (afterContext && i < lines.length - 1) {
                        const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n').trim();
                        if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                            contextScore += 0.5; afterMatch = true;
                        }
                    } else if (!afterContext) { contextScore += 0.25; }

                    if ((beforeMatch && afterMatch) || (contextScore >= 0.5 && (beforeMatch || afterMatch))) {
                        const startChar = currentLine.indexOf(singleCodeSnippetTrimmed);
                        return {
                            range: { startLine: i, startCharacter: startChar, endLine: i, endCharacter: startChar + singleCodeSnippetTrimmed.length },
                            confidence: Math.min(1.0, 0.6 + contextScore)
                        };
                    }
                }
            }
            // Search strategy 1.5: Contains match for single line
            if (singleCodeSnippetTrimmed.length > 5) { // Only for reasonably long snippets
                for (let i = 0; i < lines.length; i++) {
                    const currentLine = lines[i];
                    if (currentLine.includes(singleCodeSnippetTrimmed)) {
                        let contextScore = 0;
                        let beforeMatch = !beforeContext;
                        let afterMatch = !afterContext;

                         if (beforeContext && i > 0) {
                            const actualBefore = lines.slice(Math.max(0, i - 2), i).join('\n').trim();
                            if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                                contextScore += 0.5; beforeMatch = true;
                            }
                        } else if (!beforeContext) { contextScore += 0.25; }


                        if (afterContext && i < lines.length - 1) {
                            const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n').trim();
                            if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                                contextScore += 0.5; afterMatch = true;
                            }
                        } else if (!afterContext) { contextScore += 0.25; }
                        
                        // For 'includes' match, require stronger context or both contexts
                        if ((beforeMatch && afterMatch && contextScore >=1.0) || (contextScore >= 0.75 && (beforeMatch || afterMatch))) {
                             const startChar = currentLine.indexOf(singleCodeSnippetTrimmed);
                            return {
                                range: { startLine: i, startCharacter: startChar, endLine: i, endCharacter: startChar + singleCodeSnippetTrimmed.length },
                                confidence: Math.min(1.0, 0.4 + contextScore * 0.8) // Confidence is lower for 'includes'
                            };
                        }
                    }
                }
            }
        }


        // Original fuzzy matching (only for single line snippets if all above fails)
        if (!isMultiLineSnippet && singleCodeSnippetTrimmed.length > 10) {
            const keywords = singleCodeSnippetTrimmed.split(/\s+/).filter(word => word.length > 3);
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
                        let contextSupport = false;
                        if (beforeContext && i > 0) {
                            const actualBefore = lines.slice(Math.max(0, i - 1), i).join('\n').trim();
                            if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) contextSupport = true;
                        }
                        if (!contextSupport && afterContext && i < lines.length - 1) { // check after if before not supportive
                            const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 2)).join('\n').trim();
                            if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) contextSupport = true;
                        }
                        if (contextSupport || (!beforeContext && !afterContext)) { // If no context required, or context supports
                            let confidenceBonus = 0;
                            if (matchRatio >= 0.9) confidenceBonus = 0.1;
                            if (matchCount >= 3) confidenceBonus += 0.05;
                            return {
                                range: { startLine: i, startCharacter: 0, endLine: i, endCharacter: currentLine.length },
                                confidence: Math.min(0.8, matchRatio * 0.7 + confidenceBonus) // Adjusted base confidence
                            };
                        }
                    }
                }
            }
        }
        return null;
    }
 
    /**
     * NEW: Attempts to find a multi-line snippet that has evolved (e.g., internal lines deleted).
     * Matches based on the first and last lines of the original snippet.
     */
    private _findEvolvedMultiLinePosition(
        lines: string[],
        anchor: CommentAnchor,
        codeSnippetLines: string[], // Original snippet lines
        beforeContext?: string,
        afterContext?: string
    ): { range: CommentRange, confidence: number } | null {
        if (codeSnippetLines.length === 0) {
            return null;
        }

        const firstOriginalLineTrimmed = codeSnippetLines[0]?.trim();
        // If the original snippet is effectively empty or starts with an empty line that we can't reliably match,
        // this strategy might not be effective.
        if (codeSnippetLines[0] === undefined && codeSnippetLines.length === 1) { // Handles case where snippet is just one undefined line
            return null;
        }
        if (firstOriginalLineTrimmed === undefined && codeSnippetLines.length === 1) { // Handles case where snippet is one line that trims to undefined (e.g. only whitespace)
             return null;
        }
        // More robust check for a single, effectively empty, original line
        if (codeSnippetLines.length === 1 && (codeSnippetLines[0] === undefined || codeSnippetLines[0].trim() === "")) {
            return null;
        }


        let bestMatch: { range: CommentRange, confidence: number } | null = null;

        for (let docFirstLineCandidateIdx = 0; docFirstLineCandidateIdx < lines.length; docFirstLineCandidateIdx++) {
            const currentDocFirstLineTrimmed = lines[docFirstLineCandidateIdx].trim();
            
            // Match the first line (trimmed content)
            if (currentDocFirstLineTrimmed === firstOriginalLineTrimmed || (firstOriginalLineTrimmed === "" && currentDocFirstLineTrimmed === "")) {
                
                let currentMatchedDocLineIdx = docFirstLineCandidateIdx;
                const matchedOriginalLinesInfo: { originalIndex: number, docIndex: number }[] =
                    [{ originalIndex: 0, docIndex: docFirstLineCandidateIdx }];
                let allOriginalLinesFound = codeSnippetLines.length === 1; // If only one line, it's already found

                if (codeSnippetLines.length > 1) {
                    // Try to match the rest of the original snippet lines
                    for (let originalLineIdxToMatch = 1; originalLineIdxToMatch < codeSnippetLines.length; originalLineIdxToMatch++) {
                        const nextOriginalLineContentTrimmed = codeSnippetLines[originalLineIdxToMatch].trim();
                        let foundThisOriginalLine = false;
                        let searchLookaheadLimit = currentMatchedDocLineIdx + 1 + CommentPositionTracker.MAX_SKIPS_BETWEEN_ORIGINAL_LINES;

                        for (let docSearchIdx = currentMatchedDocLineIdx + 1;
                             docSearchIdx < lines.length && docSearchIdx <= searchLookaheadLimit;
                             docSearchIdx++) {
                            
                            const docLineToCompareTrimmed = lines[docSearchIdx].trim();
                            if (docLineToCompareTrimmed === nextOriginalLineContentTrimmed) {
                                currentMatchedDocLineIdx = docSearchIdx;
                                matchedOriginalLinesInfo.push({ originalIndex: originalLineIdxToMatch, docIndex: docSearchIdx });
                                foundThisOriginalLine = true;
                                break;
                            }
                        }
                        if (!foundThisOriginalLine) {
                            allOriginalLinesFound = false;
                            break; // Stop trying to match further lines for this candidate
                        }
                        if (originalLineIdxToMatch === codeSnippetLines.length - 1) {
                            allOriginalLinesFound = true; // Reached and matched the last original line
                        }
                    }
                }

                if (allOriginalLinesFound && matchedOriginalLinesInfo.length > 0) {
                    const newStartLine = matchedOriginalLinesInfo[0].docIndex;
                    const newEndLine = matchedOriginalLinesInfo[matchedOriginalLinesInfo.length - 1].docIndex;

                    if (newEndLine < newStartLine) continue; // Should not happen

                    // Context Score Calculation
                    let contextScore = 0;
                    const beforeContextLinesCount = anchor.beforeContext?.split('\n').length || 2;
                    const afterContextLinesCount = anchor.afterContext?.split('\n').length || 2;

                    if (beforeContext && newStartLine > 0) {
                        const actualBefore = lines.slice(Math.max(0, newStartLine - beforeContextLinesCount), newStartLine).join('\n').trim();
                        if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                            contextScore += 0.35;
                        }
                    } else if (!beforeContext) {
                        contextScore += 0.1; // Small bonus if no beforeContext was expected
                    }

                    if (afterContext && newEndLine < lines.length - 1) {
                        const actualAfter = lines.slice(newEndLine + 1, Math.min(lines.length, newEndLine + 1 + afterContextLinesCount)).join('\n').trim();
                        if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                            contextScore += 0.35;
                        }
                    } else if (!afterContext) {
                        contextScore += 0.1; // Small bonus if no afterContext was expected
                    }

                    // Structural Integrity Score
                    const numOriginalNonEmptyLines = codeSnippetLines.filter(l => l.trim() !== "").length;
                    
                    let structuralIntegrityScore = 0;
                    if (codeSnippetLines.length > 0) {
                        if (numOriginalNonEmptyLines > 0) {
                             structuralIntegrityScore = (matchedOriginalLinesInfo.length / codeSnippetLines.length);
                        } else {
                            structuralIntegrityScore = 1.0;
                        }
                    }


                    // Penalty for excessive gaps or inserted non-empty lines
                    let penalty = 0;
                    const newRangeTotalLines = newEndLine - newStartLine + 1;
                    if (newRangeTotalLines > codeSnippetLines.length + CommentPositionTracker.MAX_SKIPS_BETWEEN_ORIGINAL_LINES * (codeSnippetLines.length > 1 ? codeSnippetLines.length -1 : 0) ) {
                        penalty += 0.15; // Penalty if the new range is much longer due to skips
                    }
                    
                    let insertedNonEmptyNonOriginalLines = 0;
                    let currentOriginalMatchPointer = 0;
                    for (let k = newStartLine; k <= newEndLine; k++) {
                        if (currentOriginalMatchPointer < matchedOriginalLinesInfo.length && k === matchedOriginalLinesInfo[currentOriginalMatchPointer].docIndex) {
                            currentOriginalMatchPointer++; // This line in doc is a matched original line
                        } else if (lines[k].trim() !== "") {
                            insertedNonEmptyNonOriginalLines++; // This is an inserted non-empty line
                        }
                    }
                    if (insertedNonEmptyNonOriginalLines > 1) { // Allow one unexpected non-empty line
                        penalty += insertedNonEmptyNonOriginalLines * 0.1;
                    }
                    
                    let confidence = (structuralIntegrityScore * 0.6) + (contextScore * 0.4) - penalty;
                    confidence = Math.max(0, Math.min(1.0, confidence));
                    
                    let adjustedConfidence = confidence;
                    if (allOriginalLinesFound && structuralIntegrityScore >= 0.9) {
                        if (penalty <= 0.1 && confidence < 0.65 && confidence >= 0.50) {
                            adjustedConfidence = Math.min(0.65, confidence + 0.1);
                        }
                    }

                    if (adjustedConfidence >= 0.55) { // Confidence threshold
                        const firstOriginalLineForCharSearch = codeSnippetLines[0];
                        const lastOriginalLineForCharSearch = codeSnippetLines[matchedOriginalLinesInfo[matchedOriginalLinesInfo.length -1].originalIndex];

                        let startChar = lines[newStartLine].indexOf(firstOriginalLineForCharSearch);
                         if (firstOriginalLineForCharSearch.trim().length > 0 && lines[newStartLine].indexOf(firstOriginalLineForCharSearch.trim()) !== -1) {
                            startChar = lines[newStartLine].indexOf(firstOriginalLineForCharSearch.trim());
                        } else if (startChar === -1) {
                           startChar = 0; // Fallback if exact (even non-trimmed) not found
                        }


                        let endChar = -1;
                        const lastDocLineContent = lines[newEndLine];
                        if (lastOriginalLineForCharSearch.trim().length > 0) {
                            const tempEndCharTrimmed = lastDocLineContent.lastIndexOf(lastOriginalLineForCharSearch.trim());
                            if (tempEndCharTrimmed !== -1) {
                                endChar = tempEndCharTrimmed + lastOriginalLineForCharSearch.trim().length;
                            }
                        }
                        if (endChar === -1) { // Try non-trimmed if trimmed failed or was empty
                             const tempEndCharNonTrimmed = lastDocLineContent.lastIndexOf(lastOriginalLineForCharSearch);
                             if (tempEndCharNonTrimmed !== -1) {
                                 endChar = tempEndCharNonTrimmed + lastOriginalLineForCharSearch.length;
                             }
                        }
                        if (endChar === -1) endChar = lastDocLineContent.length; // Fallback

                        const currentRange: CommentRange = {
                            startLine: newStartLine,
                            startCharacter: startChar,
                            endLine: newEndLine,
                            endCharacter: endChar
                        };
                        const currentCandidate = { range: currentRange, confidence: adjustedConfidence };

                        if (!bestMatch ||
                            currentCandidate.range.startLine < bestMatch.range.startLine ||
                            (currentCandidate.range.startLine === bestMatch.range.startLine && currentCandidate.confidence > bestMatch.confidence)) {
                            bestMatch = currentCandidate;
                        }
                    }
                }
            }
        }
        return bestMatch;
    }
 
    /**
     * 监听文档变化，实时更新评论位置
     */
    setupDocumentChangeListener(commentService: any): vscode.Disposable {
        let updateTimeout: NodeJS.Timeout | undefined;
        
        return vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document && event.contentChanges.length > 0) {
                // 清除之前的超时，避免频繁更新
                if (updateTimeout) {
                    clearTimeout(updateTimeout);
                }
                
                // 检查是否有影响行号的变化（插入/删除行）
                const hasLineChanges = event.contentChanges.some(change => 
                    change.text.includes('\n') || change.rangeLength > 0 && change.range.start.line !== change.range.end.line
                );
                
                if (hasLineChanges) {
                    // 立即更新评论位置（对于行号变化）
                    updateTimeout = setTimeout(async () => {
                        await this.updateCommentsForDocument(event.document, commentService);
                    }, 300); // 减少延迟到300ms，更快响应
                } else {
                    // 对于行内变化，使用较长延迟
                    updateTimeout = setTimeout(async () => {
                        const hasSubstantialChanges = event.contentChanges.some(change => 
                            change.rangeLength > 10 || change.text.length > 10
                        );
                        
                        if (hasSubstantialChanges) {
                            await this.updateCommentsForDocument(event.document, commentService);
                        }
                    }, 1500); // 行内变化延迟1.5秒
                }
            }
        });
    }
    
    /**
     * 更新特定文档的评论位置
     */
    private async updateCommentsForDocument(
        document: vscode.TextDocument, 
        commentService: any
    ): Promise<void> {
        try {            const comments = commentService.getCommentsForFile(document.uri.toString());
            if (comments.length === 0) {
                return;
            }
            
            const updatedComments = await this.validateCommentPositions(document, comments);
            
            // 检查是否有位置变化
            const hasChanges = updatedComments.some((comment, index) => 
                comment.anchor.status !== comments[index].anchor.status
            );
            
            if (hasChanges) {
                // 更新评论并通知用户
                commentService.updateComments(updatedComments);
                this.notifyPositionChanges(updatedComments);
            }
        } catch (error) {
            console.error('更新评论位置时出错:', error);
        }
    }
    
    /**
     * 通知用户评论位置变化
     */
    private notifyPositionChanges(comments: Comment[]): void {
        const movedComments = comments.filter(c => c.anchor.status === 'moved');
        const deletedComments = comments.filter(c => c.anchor.status === 'deleted');
        
        if (movedComments.length > 0) {
            vscode.window.showWarningMessage(
                `${movedComments.length} 个评论的位置已自动更新`,
                '查看详情'
            ).then(action => {
                if (action === '查看详情') {
                    this.showPositionChangeDetails(movedComments, deletedComments);
                }
            });
        }
        
        if (deletedComments.length > 0) {
            vscode.window.showErrorMessage(
                `${deletedComments.length} 个评论可能已失效（代码已删除）`,
                '查看详情'
            ).then(action => {
                if (action === '查看详情') {
                    this.showPositionChangeDetails(movedComments, deletedComments);
                }
            });
        }
    }
    
    /**
     * 显示位置变化详情
     */
    private showPositionChangeDetails(moved: Comment[], deleted: Comment[]): void {
        let message = '';
        
        if (moved.length > 0) {
            message += `已移动的评论 (${moved.length}):\n`;
            moved.forEach(comment => {
                const confidence = Math.round((comment.anchor.confidence || 0) * 100);
                message += `• "${comment.text.substring(0, 30)}..." (置信度: ${confidence}%)\n`;
            });
        }
        
        if (deleted.length > 0) {
            message += `\n可能已删除的评论 (${deleted.length}):\n`;
            deleted.forEach(comment => {
                message += `• "${comment.text.substring(0, 30)}..."\n`;
            });
        }
        
        vscode.window.showInformationMessage(message, { modal: true });
    }
    
    /**
     * 手动重新定位所有评论
     */
    async relocateAllComments(documentUri: string, commentService: any): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri));
            const comments = commentService.getCommentsForFile(documentUri);
            
            if (comments.length === 0) {
                vscode.window.showInformationMessage('该文件没有评论需要重新定位');
                return;
            }
            
            const updatedComments = await this.validateCommentPositions(document, comments);
            commentService.updateComments(updatedComments);
            
            const stats = this.getRelocationStats(updatedComments);
            vscode.window.showInformationMessage(
                `重新定位完成: ${stats.valid} 个有效, ${stats.moved} 个已移动, ${stats.deleted} 个可能已删除`
            );
            
        } catch (error) {
            vscode.window.showErrorMessage(`重新定位评论时出错: ${error}`);
        }
    }
    
    /**
     * 获取重新定位统计信息
     */
    private getRelocationStats(comments: Comment[]): { valid: number, moved: number, deleted: number } {
        return {
            valid: comments.filter(c => c.anchor.status === 'valid').length,
            moved: comments.filter(c => c.anchor.status === 'moved').length,
            deleted: comments.filter(c => c.anchor.status === 'deleted').length
        };
    }
    
    /**
     * 检查位置变化是否合理，防止评论跳跃到过远的位置
     */
    private isPositionChangeReasonable(
        originalRange: CommentRange, 
        newRange: CommentRange, 
        confidence: number    ): boolean {
        // 调整置信度要求：对于明确的代码匹配，可以接受较低的置信度
        if (confidence < 0.6) {
            return false;
        }
        
        // 计算移动距离（以行为单位）
        const lineDistance = Math.abs(newRange.startLine - originalRange.startLine);
        
        // 限制最大移动距离为15行，适当放宽距离限制
        const maxMoveDistance = 15;
        if (lineDistance > maxMoveDistance) {
            return false;
        }
        
        // 根据移动距离调整置信度要求
        if (lineDistance <= 3) {
            // 短距离移动：置信度≥0.6即可
            return confidence >= 0.6;
        } else if (lineDistance <= 8) {
            // 中等距离移动：置信度≥0.7
            return confidence >= 0.7;
        } else {
            // 远距离移动：置信度≥0.8
            return confidence >= 0.8;
        }
    }    /**
     * 尝试智能调整行号偏移（处理简单的插入/删除行操作）
     */
    private tryAdjustLineOffset(lines: string[], anchor: CommentAnchor): CommentAnchor {
        const originalRange = anchor.originalRange;
        const originalCodeSnippet = anchor.codeSnippet;
        const codeSnippetLines = originalCodeSnippet.trim().split('\n');
        const isMultiLineSnippet = codeSnippetLines.length > 1;

        const searchStartLine = Math.max(0, originalRange.startLine - 20);
        const searchEndLine = Math.min(lines.length - (isMultiLineSnippet ? codeSnippetLines.length : 1), originalRange.startLine + 50);

        for (let i = searchStartLine; i <= searchEndLine; i++) {
            let potentialMatch = true;
            let currentActualSnippetLines = [];

            for (let j = 0; j < codeSnippetLines.length; j++) {
                const docLine = lines[i + j];
                const snippetLine = codeSnippetLines[j];
                if (docLine.trim() !== snippetLine.trim()) {
                    potentialMatch = false;
                    break;
                }
                currentActualSnippetLines.push(docLine);
            }

            if (potentialMatch) {
                const lineOffset = i - originalRange.startLine;
                const newStartLine = i;
                const newEndLine = i + codeSnippetLines.length - 1;

                if (lineOffset !== 0) {
                    if (this.validateContextForLineOffset(lines, anchor, newStartLine, newEndLine) || (!anchor.beforeContext && !anchor.afterContext)) {
                        const firstLineInDoc = lines[newStartLine];
                        const lastLineInDoc = lines[newEndLine];
                        const firstSnippetLineTrimmed = codeSnippetLines[0].trim();
                        const lastSnippetLineTrimmed = codeSnippetLines[codeSnippetLines.length - 1].trim();

                        let startChar = firstLineInDoc.indexOf(firstSnippetLineTrimmed);
                        if (startChar === -1 && firstSnippetLineTrimmed.length > 0) startChar = firstLineInDoc.indexOf(codeSnippetLines[0]);
                        if (startChar === -1) startChar = 0;

                        let endChar = -1;
                        if (lastSnippetLineTrimmed.length > 0) {
                           endChar = lastLineInDoc.indexOf(lastSnippetLineTrimmed);
                           if (endChar !== -1) endChar += lastSnippetLineTrimmed.length;
                           else {
                               endChar = lastLineInDoc.indexOf(codeSnippetLines[codeSnippetLines.length-1]);
                               if (endChar !== -1) endChar += codeSnippetLines[codeSnippetLines.length-1].length;
                           }
                        }
                        if (endChar === -1 || (endChar === 0 && lastSnippetLineTrimmed.length > 0)) endChar = lastLineInDoc.length;
                        
                        return {
                            ...anchor,
                            originalRange: {
                                startLine: newStartLine,
                                startCharacter: startChar,
                                endLine: newEndLine,
                                endCharacter: endChar
                            },
                            codeSnippet: currentActualSnippetLines.join('\n')
                        };
                    }
                } else {
                    return {
                        ...anchor,
                        codeSnippet: currentActualSnippetLines.join('\n')
                    };
                }
            }
        }
        
        const singleSnippetLineTrimmed = codeSnippetLines[0].trim();
        if (!isMultiLineSnippet && singleSnippetLineTrimmed.length > 5) {
            for (let i = searchStartLine; i <= searchEndLine; i++) { // searchEndLine is for single line here
                const currentLine = lines[i];
                if (currentLine.includes(singleSnippetLineTrimmed)) {
                    const lineOffset = i - originalRange.startLine;
                    if (Math.abs(lineOffset) <= 15) {
                        const startChar = currentLine.indexOf(singleSnippetLineTrimmed);
                        // For "includes", also validate context if available
                         if (this.validateContextForLineOffset(lines, anchor, i, i) || (!anchor.beforeContext && !anchor.afterContext)) {
                            return {
                                ...anchor,
                                originalRange: {
                                    startLine: i,
                                    startCharacter: startChar,
                                    endLine: i,
                                    endCharacter: startChar + singleSnippetLineTrimmed.length
                                },
                                codeSnippet: currentLine.substring(startChar, startChar + singleSnippetLineTrimmed.length)
                            };
                        }
                    }
                }
            }
        }
        return this.tryContextBasedAdjustment(lines, anchor);
    }
    
    /**
     * 验证行号偏移时的上下文
     */
    private validateContextForLineOffset(lines: string[], anchor: CommentAnchor, newStartLineIndex: number, newEndLineIndex: number): boolean {
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        let beforeOk = !beforeContext;
        let afterOk = !afterContext;

        if (beforeContext && newStartLineIndex > 0) {
            const actualBeforeLines = lines.slice(Math.max(0, newStartLineIndex - (anchor.beforeContext?.split('\n').length || 2)), newStartLineIndex);
            const actualBeforeText = actualBeforeLines.join('\n').trim();
            if (actualBeforeText.includes(beforeContext) || beforeContext.includes(actualBeforeText)) {
                beforeOk = true;
            }
        }

        if (afterContext && newEndLineIndex < lines.length - 1) {
            const actualAfterLines = lines.slice(newEndLineIndex + 1, Math.min(lines.length, newEndLineIndex + 1 + (anchor.afterContext?.split('\n').length || 2)));
            const actualAfterText = actualAfterLines.join('\n').trim();
            if (actualAfterText.includes(afterContext) || afterContext.includes(actualAfterText)) {
                afterOk = true;
            }
        }
        // If no context was defined in the anchor, it's considered a match for that part.
        // Both must be okay (or not defined) to return true.
        return beforeOk && afterOk;
        // 如果没有上下文，则接受位置变化（假设是简单的行号偏移）
        return !beforeContext && !afterContext;
    }    /**
     * 基于上下文的智能调整
     */
    private tryContextBasedAdjustment(lines: string[], anchor: CommentAnchor): CommentAnchor {
        const originalRange = anchor.originalRange;
        const codeSnippet = anchor.codeSnippet.trim();
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        
        // 如果有上下文信息，基于上下文重新定位
        if (beforeContext || afterContext) {
            // 寻找前置上下文
            for (let i = 0; i < lines.length - 1; i++) {
                const currentLine = lines[i].trim();
                
                if (beforeContext && (currentLine.includes(beforeContext) || beforeContext.includes(currentLine))) {
                    // 扩大搜索范围
                    for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
                        const targetLine = lines[j];
                        const targetTrimmed = targetLine.trim();
                        
                        // 增强的匹配逻辑
                        const similarity = this.calculateSimilarity(targetTrimmed, codeSnippet);
                        const containsSnippet = targetTrimmed.includes(codeSnippet);
                        const isKeywordMatch = this.hasSignificantKeywordMatch(targetTrimmed, codeSnippet);
                        
                        // 更宽松的匹配条件
                        const isMatch = containsSnippet || 
                            (codeSnippet.length > 10 && similarity > 0.6) ||
                            (isKeywordMatch && similarity > 0.5);
                        
                        if (isMatch) {
                            // 更宽松的后置上下文验证
                            let afterContextValid = !afterContext;
                            if (afterContext && j < lines.length - 1) {
                                // 尝试多种方式找到后置上下文
                                for (let k = j + 1; k < Math.min(lines.length, j + 8); k++) {
                                    const afterLine = lines[k].trim();
                                    const afterSimilarity = this.calculateSimilarity(afterLine, afterContext);
                                    
                                    // 宽松的后置上下文匹配
                                    if (afterLine.includes(afterContext) || 
                                        afterContext.includes(afterLine) ||
                                        afterSimilarity > 0.5 ||
                                        this.hasSignificantKeywordMatch(afterLine, afterContext)) {
                                        afterContextValid = true;
                                        break;
                                    }
                                }
                                
                                // 如果没找到精确的后置上下文，检查是否有相关的变量引用
                                if (!afterContextValid) {
                                    const keywords = this.extractKeywords(codeSnippet);
                                    
                                    for (let k = j + 1; k < Math.min(lines.length, j + 8); k++) {
                                        const afterLine = lines[k].trim();
                                        const afterKeywords = this.extractKeywords(afterLine);
                                        
                                        for (const keyword of keywords) {
                                            if (afterLine.includes(keyword) || 
                                                afterKeywords.some(w => this.areWordsRelated(w, keyword))) {
                                                afterContextValid = true;
                                                break;
                                            }
                                        }
                                        if (afterContextValid) {
                                            break;
                                        }
                                    }
                                }
                            }
                            
                            if (afterContextValid) {
                                const startChar = targetLine.indexOf(codeSnippet);
                                let adjustedStartChar = startChar >= 0 ? startChar : 0;
                                let adjustedEndChar = startChar >= 0 ? startChar + codeSnippet.length : targetLine.length;
                                
                                // 关键词匹配时的位置调整
                                if (startChar < 0 && isKeywordMatch) {
                                    const keywords = codeSnippet.split(/\s+/).filter(w => w.length > 3);
                                    const firstKeyword = keywords[0];
                                    const keywordPos = targetLine.indexOf(firstKeyword);
                                    if (keywordPos >= 0) {
                                        adjustedStartChar = keywordPos;
                                        adjustedEndChar = Math.min(targetLine.length, keywordPos + codeSnippet.length);
                                    }
                                }
                                
                                return {
                                    ...anchor,
                                    originalRange: {
                                        startLine: j,
                                        startCharacter: adjustedStartChar,
                                        endLine: j,
                                        endCharacter: adjustedEndChar
                                    }
                                };
                            }
                        }
                    }
                }
            }
        }
        
        // 没有找到合适的调整，返回原始锚点
        return anchor;
    }
    
    /**
     * 检查是否有显著的关键词匹配
     */
    private hasSignificantKeywordMatch(str1: string, str2: string): boolean {
        const keywords1 = this.extractKeywords(str1);
        const keywords2 = this.extractKeywords(str2);
        
        if (keywords1.length === 0 || keywords2.length === 0) {
            return false;
        }
        
        let matchCount = 0;
        const totalKeywords = Math.max(keywords1.length, keywords2.length);
        
        for (const keyword1 of keywords1) {
            if (keywords2.some(keyword2 => 
                keyword2.includes(keyword1) || 
                keyword1.includes(keyword2) ||
                this.areWordsRelated(keyword1, keyword2)
            )) {
                matchCount++;
            }
        }
        
        // 需要至少50%的关键词匹配
        return (matchCount / totalKeywords) >= 0.5;
    }
    
    /**
     * 提取关键词
     */
    private extractKeywords(text: string): string[] {
        return text
            .split(/[\s\(\)\[\]\{\};,\.=+\-*\/]+/)
            .filter(word => word.length > 2 && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(word))
            .filter(word => !['const', 'let', 'var', 'function', 'return', 'console', 'log'].includes(word.toLowerCase()));
    }
    
    /**
     * 检查两个词是否相关（处理变量重命名等情况）
     */
    private areWordsRelated(word1: string, word2: string): boolean {
        // 处理常见的变量重命名模式
        const patterns = [
            ['sum', 'result', 'value', 'total'],
            ['data', 'info', 'content'],
            ['item', 'element', 'node'],
            ['index', 'idx', 'i'],
            ['count', 'num', 'number']
        ];
        
        for (const pattern of patterns) {
            if (pattern.includes(word1.toLowerCase()) && pattern.includes(word2.toLowerCase())) {
                return true;
            }
        }
        
        // 检查是否有共同的词根
        if (word1.length > 4 && word2.length > 4) {
            const root1 = word1.substring(0, Math.min(4, word1.length));
            const root2 = word2.substring(0, Math.min(4, word2.length));
            if (root1 === root2) {
                return true;
            }
        }
        
        return false;
    }
      /**
     * 计算两个字符串的相似度
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const words1 = str1.split(/\s+/).filter(w => w.length > 2);
        const words2 = str2.split(/\s+/).filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) {
            return 0;
        }
        
        let matchCount = 0;
        for (const word1 of words1) {
            if (words2.some(word2 => 
                word2.includes(word1) || 
                word1.includes(word2) ||
                this.areWordsRelated(word1, word2)
            )) {
                matchCount++;
            }
        }
        
        return matchCount / Math.max(words1.length, words2.length);
    }
    
    /**
     * 销毁监听器
     */
    dispose() {
        this.disposables.forEach(d => d.dispose());
        this.documentChangeHandlers.forEach(timeout => clearTimeout(timeout));
        this.documentChangeHandlers.clear();
    }
    
    /**
     * 设置高级变化检测
     */
    private setupAdvancedChangeDetection() {
        // 监听文件重命名/移动
        this.disposables.push(
            vscode.workspace.onDidRenameFiles(e => {
                this.handleFileRename(e);
            })
        );
    }
    
    /**
     * 处理文件重命名
     */
    private handleFileRename(event: vscode.FileRenameEvent) {
        for (const file of event.files) {
            const oldUri = file.oldUri.toString();
            const newUri = file.newUri.toString();
            
            // 更新评论位置缓存
            const commentCache = this.commentPositionCache.get(oldUri);
            if (commentCache) {
                this.commentPositionCache.set(newUri, commentCache);
                this.commentPositionCache.delete(oldUri);
            }
            
            // 更新文档状态缓存
            const stateCache = this.documentStateCache.get(oldUri);
            if (stateCache) {
                this.documentStateCache.set(newUri, stateCache);
                this.documentStateCache.delete(oldUri);
            }
        }
    }
    
    /**
     * 注册评论到位置缓存
     */
    public registerComment(documentUri: string, commentId: string, anchor: CommentAnchor) {
        if (!this.commentPositionCache.has(documentUri)) {
            this.commentPositionCache.set(documentUri, new Map());
        }
        this.commentPositionCache.get(documentUri)!.set(commentId, anchor);
    }
    
    /**
     * 从位置缓存中移除评论
     */
    public unregisterComment(documentUri: string, commentId: string) {
        const cache = this.commentPositionCache.get(documentUri);
        if (cache) {
            cache.delete(commentId);
            if (cache.size === 0) {
                this.commentPositionCache.delete(documentUri);
            }
        }
    }
    
    /**
     * 获取文档的所有评论锚点（用于调试）
     */
    public getDocumentCommentAnchors(documentUri: string): Map<string, CommentAnchor> | undefined {
        return this.commentPositionCache.get(documentUri);
    }
    
    /**
     * 清理过期的缓存数据
     */
    public cleanupCache(maxAge: number = 24 * 60 * 60 * 1000) { // 默认24小时
        const now = Date.now();
        
        // 清理文档状态缓存
        for (const [uri, state] of this.documentStateCache.entries()) {
            if (now - state.lastModified > maxAge) {
                this.documentStateCache.delete(uri);
                this.commentPositionCache.delete(uri);
            }
        }
    }
}
