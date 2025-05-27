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
        
        // 检查是否有行号变化
        const hasLineChanges = event.contentChanges.some(change => 
            change.text.includes('\n') || 
            (change.rangeLength > 0 && change.range.start.line !== change.range.end.line)
        );
        
        // 根据变化类型设置不同的响应延迟
        const delay = hasLineChanges ? 100 : 500; // 行号变化快速响应，内容变化延迟响应
        
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
              // 2. 尝试重新定位
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
            
            // 3. 标记为可能删除
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
        
        // 在原始位置附近搜索代码片段（上下各搜索3行）
        const searchStart = Math.max(0, originalRange.startLine - 3);
        const searchEnd = Math.min(lines.length - 1, originalRange.startLine + 3);
        
        for (let i = searchStart; i <= searchEnd; i++) {
            const currentLine = lines[i];
            
            // 检查是否找到完全匹配的代码片段
            if (currentLine.trim() === codeSnippet) {
                // 找到了，说明只是行号发生了偏移
                const lineOffset = i - originalRange.startLine;
                
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
        
        // 没有找到简单的偏移，返回原始锚点
        return anchor;
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
