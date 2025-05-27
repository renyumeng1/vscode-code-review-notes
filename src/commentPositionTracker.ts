import * as vscode from 'vscode';
import { Comment, CommentAnchor, CommentRange } from './types';

/**
 * 评论位置追踪器
 * 负责智能跟踪评论位置，处理代码删除/移动等情况
 */
export class CommentPositionTracker {
    private disposables: vscode.Disposable[] = [];
    private documentChangeHandlers: Map<string, NodeJS.Timeout> = new Map();
    private silentMode: boolean = true; // 静默模式，不显示通知
    
    constructor() {
        this.setupSilentRealTimeMonitoring();
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
    }
      /**
     * 静默处理文档变化 - 不显示任何用户通知
     */
    private handleDocumentChangeSilent(event: vscode.TextDocumentChangeEvent) {
        const document = event.document;
        const uri = document.uri.fsPath;
        
        // 清除之前的定时器
        const existingTimeout = this.documentChangeHandlers.get(uri);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }
        
        // 检查变化类型
        const hasLineChanges = event.contentChanges.some(change => 
            change.text.includes('\n') || 
            (change.rangeLength > 0 && change.range.start.line !== change.range.end.line)
        );
        
        // 检查是否是简单的换行操作（如按Enter键）
        const isSimpleNewlineInsert = event.contentChanges.length === 1 && 
            event.contentChanges[0].text === '\n' && 
            event.contentChanges[0].rangeLength === 0;
        
        // 根据变化类型设置不同的响应延迟
        let delay;
        if (isSimpleNewlineInsert) {
            delay = 10; // 换行操作立即响应
        } else if (hasLineChanges) {
            delay = 50; // 其他行号变化快速响应
        } else {
            delay = 300; // 内容变化延迟响应
        }
        
        // 设置新的定时器
        const timeout = setTimeout(() => {
            this.validateDocumentCommentsSilent(document);
            this.documentChangeHandlers.delete(uri);
        }, delay);
        
        this.documentChangeHandlers.set(uri, timeout);
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
        range: vscode.Range
    ): Promise<CommentAnchor> {
        const text = document.getText();
        const lines = text.split('\n');
        
        // 获取上下文
        const beforeLines = 2; // 前2行
        const afterLines = 2;  // 后2行
        
        const beforeContext = lines
            .slice(Math.max(0, range.start.line - beforeLines), range.start.line)
            .join('\n');
            
        const afterContext = lines
            .slice(range.end.line + 1, Math.min(lines.length, range.end.line + afterLines + 1))
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
          return comments.map(comment => {
            const anchor = comment.anchor;
            const originalRange = anchor.originalRange;
            
            // 1. 首先尝试智能行号调整（处理简单的行号偏移）
            const adjustedAnchor = this.tryAdjustLineOffset(lines, anchor);
            
            // 2. 检查调整后的位置是否有效
            if (this.isOriginalPositionValid(lines, adjustedAnchor)) {
                return {
                    ...comment,
                    anchor: {
                        ...adjustedAnchor,
                        status: 'valid' as const,
                        lastValidatedAt: Date.now()
                    }
                };
            }
            
            // 3. 如果智能调整后仍然无效，尝试重新定位
            const newPosition = this.findNewPosition(lines, anchor);
            
            if (newPosition && this.isPositionChangeReasonable(anchor.originalRange, newPosition.range, newPosition.confidence)) {
                return {
                    ...comment,
                    anchor: {
                        ...anchor,
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
    }
    
    /**
     * 检查原始位置是否仍然有效
     */
    private isOriginalPositionValid(lines: string[], anchor: CommentAnchor): boolean {
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
        
        const codeSnippet = anchor.codeSnippet.trim();
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
          // 搜索策略1：完整匹配（代码片段 + 上下文）
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
              // 必须是精确的代码片段匹配
            if (currentLine.trim() === codeSnippet.trim()) {
                // 检查上下文匹配
                let contextScore = 0;
                let beforeMatch = false;
                let afterMatch = false;
                
                // 检查前面的上下文（更灵活的搜索范围）
                if (beforeContext && i > 0) {
                    // 扩大搜索范围，并且允许部分匹配
                    for (let j = Math.max(0, i - 5); j < i; j++) {
                        const contextLine = lines[j].trim();
                        if (contextLine.includes(beforeContext) || beforeContext.includes(contextLine)) {
                            contextScore += 0.5;
                            beforeMatch = true;
                            break;
                        }
                        // 检查关键词匹配
                        const beforeKeywords = beforeContext.split(/\s+/).filter(w => w.length > 3);
                        const lineKeywords = contextLine.split(/\s+/).filter(w => w.length > 3);
                        const commonKeywords = beforeKeywords.filter(kw => lineKeywords.some(lw => lw.includes(kw)));
                        if (commonKeywords.length >= beforeKeywords.length * 0.7) {
                            contextScore += 0.3;
                            beforeMatch = true;
                            break;
                        }
                    }
                }
                
                // 检查后面的上下文
                if (afterContext && i < lines.length - 1) {
                    const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n').trim();
                    if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                        contextScore += 0.5;
                        afterMatch = true;
                    }
                }
                
                // 提高匹配要求：需要至少一个上下文匹配，且总分≥0.5
                if (contextScore >= 0.5 && (beforeMatch || afterMatch)) {
                    const startChar = currentLine.indexOf(codeSnippet.trim());
                    return {
                        range: {
                            startLine: i,
                            startCharacter: startChar,
                            endLine: i,
                            endCharacter: startChar + codeSnippet.trim().length
                        },
                        confidence: Math.min(1.0, 0.6 + contextScore)
                    };
                }
            }
        }
        
        // 搜索策略1.5：宽松匹配（包含关系但要求更高的上下文分数）
        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];
            
            if (currentLine.includes(codeSnippet)) {
                // 检查上下文匹配
                let contextScore = 0;
                let beforeMatch = false;
                let afterMatch = false;
                
                // 检查前面的上下文
                if (beforeContext && i > 0) {
                    const actualBefore = lines.slice(Math.max(0, i - 2), i).join('\n').trim();
                    if (actualBefore.includes(beforeContext) || beforeContext.includes(actualBefore)) {
                        contextScore += 0.5;
                        beforeMatch = true;
                    }
                }
                
                // 检查后面的上下文
                if (afterContext && i < lines.length - 1) {
                    const actualAfter = lines.slice(i + 1, Math.min(lines.length, i + 3)).join('\n').trim();
                    if (actualAfter.includes(afterContext) || afterContext.includes(actualAfter)) {
                        contextScore += 0.5;
                        afterMatch = true;
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
          // 搜索策略2：模糊匹配（严格限制，仅在确实需要时使用）
        // 只有在代码片段足够独特时才进行模糊匹配
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
                    
                    // 大幅提高匹配要求：需要80%的关键词匹配，且至少包含主要标识符
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
                        if (contextSupport) {                            // 提高模糊匹配的置信度计算
                            let confidenceBonus = 0;
                            if (matchRatio >= 0.9) {
                                confidenceBonus = 0.1;  // 90%以上匹配给予奖励
                            }
                            if (matchCount >= 3) {
                                confidenceBonus += 0.05;  // 多关键词匹配奖励
                            }
                            
                            return {
                                range: {
                                    startLine: i,
                                    startCharacter: 0,
                                    endLine: i,
                                    endCharacter: currentLine.length
                                },
                                confidence: Math.min(0.8, matchRatio * 0.8 + confidenceBonus)  // 提高模糊匹配的置信度
                            };
                        }
                    }
                }
            }
        }
        
        return null;
    }    /**
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
    }
      /**
     * 尝试智能调整行号偏移（处理简单的插入/删除行操作）
     */
    private tryAdjustLineOffset(lines: string[], anchor: CommentAnchor): CommentAnchor {
        const originalRange = anchor.originalRange;
        const codeSnippet = anchor.codeSnippet.trim();
        
        // 扩大搜索范围以处理插入空行等情况
        const searchStart = Math.max(0, originalRange.startLine - 5);
        const searchEnd = Math.min(lines.length - 1, originalRange.startLine + 10);
        
        // 首先尝试精确匹配
        for (let i = searchStart; i <= searchEnd; i++) {
            const currentLine = lines[i];
            
            // 检查是否找到完全匹配的代码片段
            if (currentLine.trim() === codeSnippet) {
                const lineOffset = i - originalRange.startLine;
                
                if (lineOffset !== 0) {
                    // 验证上下文以确保这是正确的位置
                    if (this.validateContextForLineOffset(lines, anchor, i)) {
                        return {
                            ...anchor,
                            originalRange: {
                                startLine: i,
                                startCharacter: currentLine.indexOf(codeSnippet.trim()),
                                endLine: i,
                                endCharacter: currentLine.indexOf(codeSnippet.trim()) + codeSnippet.length
                            }
                        };
                    }
                }
            }
        }
        
        // 如果精确匹配失败，尝试基于上下文的智能调整
        return this.tryContextBasedAdjustment(lines, anchor);
    }
    
    /**
     * 验证行号偏移时的上下文
     */
    private validateContextForLineOffset(lines: string[], anchor: CommentAnchor, newLineIndex: number): boolean {
        const beforeContext = anchor.beforeContext?.trim();
        const afterContext = anchor.afterContext?.trim();
        
        // 检查前置上下文
        if (beforeContext && newLineIndex > 0) {
            for (let i = Math.max(0, newLineIndex - 3); i < newLineIndex; i++) {
                const contextLine = lines[i].trim();
                if (contextLine.includes(beforeContext) || beforeContext.includes(contextLine)) {
                    // 检查后置上下文（如果存在）
                    if (!afterContext) return true;
                    
                    for (let j = newLineIndex + 1; j < Math.min(lines.length, newLineIndex + 4); j++) {
                        const afterLine = lines[j].trim();
                        if (afterLine.includes(afterContext) || afterContext.includes(afterLine)) {
                            return true;
                        }
                    }
                }
            }
        }
        
        // 如果没有前置上下文，只检查后置上下文
        if (!beforeContext && afterContext && newLineIndex < lines.length - 1) {
            for (let j = newLineIndex + 1; j < Math.min(lines.length, newLineIndex + 4); j++) {
                const afterLine = lines[j].trim();
                if (afterLine.includes(afterContext) || afterContext.includes(afterLine)) {
                    return true;
                }
            }
        }
        
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
                                        if (afterContextValid) break;
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
        
        if (keywords1.length === 0 || keywords2.length === 0) return false;
        
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
            if (root1 === root2) return true;
        }
        
        return false;
    }
      /**
     * 计算两个字符串的相似度
     */
    private calculateSimilarity(str1: string, str2: string): number {
        const words1 = str1.split(/\s+/).filter(w => w.length > 2);
        const words2 = str2.split(/\s+/).filter(w => w.length > 2);
        
        if (words1.length === 0 || words2.length === 0) return 0;
        
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
}
