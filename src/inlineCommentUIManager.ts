import * as vscode from 'vscode';
import { CommentService } from './commentService';
import { Comment, CommentRange } from './types';
import { InlineChatWidget } from './inlineChatWidget';

/**
 * 内联评论UI管理器 - 类似Cursor的评论交互体验
 * 负责显示悬浮的"Add Comment"按钮和删除评论按钮
 */
export class InlineCommentUIManager {
    private disposables: vscode.Disposable[] = [];
    private addCommentWebviewPanel: vscode.WebviewPanel | undefined;
    private currentHoverLine: number = -1;
    private isHovering: boolean = false;
    private hoverTimeout: NodeJS.Timeout | undefined;
    private addCommentDecorationType: vscode.TextEditorDecorationType;
    private statusBarItem: vscode.StatusBarItem | undefined;
    private addCommentCodeLensDisposable: vscode.Disposable | undefined;
    private inlineChatWidget: InlineChatWidget;

    constructor(
        private context: vscode.ExtensionContext,
        private commentService: CommentService
    ) {
        // 创建装饰类型
        this.addCommentDecorationType = vscode.window.createTextEditorDecorationType({
            after: {
                contentText: ' 💬 Add Comment',
                color: 'rgba(100, 149, 237, 0.8)',
                fontStyle: 'italic',
                margin: '0 0 0 10px',
                textDecoration: 'none'
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
        });
        
        // 初始化内联聊天小部件
        this.inlineChatWidget = new InlineChatWidget(context, commentService);
        
        this.setupEventListeners();
    }    private setupEventListeners() {
        // 监听鼠标选择变化
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(e => {
                this.handleSelectionChange(e);
            })
        );        // 监听编辑器变化
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.clearAllUI(); // 编辑器变化时完全清理
                if (editor) {
                    this.setupEditorListeners(editor);
                }
            })
        );

        // 监听视口变化 - 只清理装饰器和状态栏，保留代码镜头
        this.disposables.push(
            vscode.window.onDidChangeTextEditorVisibleRanges(e => {
                this.hideAddCommentUI();
            })
        );

        // 监听文档变化 - 只清理装饰器和状态栏，保留代码镜头
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                this.hideAddCommentUI();
            })
        );

        // 为当前活动编辑器设置监听器
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            this.setupEditorListeners(activeEditor);
        }
    }

    private setupEditorListeners(editor: vscode.TextEditor) {
        // 这里我们通过监听选择变化来模拟hover效果
        // VS Code API有限，我们使用选择变化作为触发器
    }    private handleSelectionChange(e: vscode.TextEditorSelectionChangeEvent) {
        const editor = e.textEditor;
        const selection = e.selections[0];
        
        // 如果没有选择或选择为空，清理所有UI元素
        if (!selection || selection.isEmpty) {
            this.clearAllUI(); // 完全清理，包括代码镜头
            return;
        }

        const lineNumber = selection.start.line;
        
        // 检查当前行是否有评论
        const hasComment = this.hasCommentOnLine(editor.document, lineNumber);
        
        if (hasComment) {
            this.clearAllUI(); // 清理所有UI
            this.showDeleteCommentButton(editor, lineNumber);
        } else {
            // 只有当真正选择了文本(不是单击或移动光标)时才显示添加评论按钮
            // 确保 selection.isEmpty 为 false，并且选择范围的起始和结束位置不同
            if (!selection.isEmpty &&
                (selection.start.line !== selection.end.line || selection.start.character !== selection.end.character)) {
                // 先清理之前的代码镜头，再显示新的
                if (this.addCommentCodeLensDisposable) {
                    this.addCommentCodeLensDisposable.dispose();
                    this.addCommentCodeLensDisposable = undefined;
                }
                this.showAddCommentButton(editor, lineNumber);
            } else {
                // 如果没有选择文本（例如，只是光标移动），则清理所有UI
                this.clearAllUI();
            }
        }
    }

    private hasCommentOnLine(document: vscode.TextDocument, lineNumber: number): boolean {
        const comments = this.commentService.getCommentsForFile(document.uri.fsPath);
        return comments.some(comment => 
            comment.anchor.originalRange.startLine <= lineNumber && 
            comment.anchor.originalRange.endLine >= lineNumber
        );
    }    /**
     * 显示Add Comment按钮（只使用CodeLens，类似Copilot体验）
     */
    private showAddCommentButton(editor: vscode.TextEditor, lineNumber: number) {
        // 清理之前的装饰
        this.hideAddCommentUI();
        
        // 只使用代码镜头提供清爽的交互体验（类似Copilot）
        this.showAddCommentCodeLens(editor, lineNumber);
    }    /**
     * 使用代码镜头显示Add Comment按钮（持续显示，不自动隐藏）
     */
    private showAddCommentCodeLens(editor: vscode.TextEditor, lineNumber: number) {
        // 清理之前的代码镜头
        if (this.addCommentCodeLensDisposable) {
            this.addCommentCodeLensDisposable.dispose();
        }

        const codeLensProvider = new AddCommentCodeLensProvider(
            editor.document.uri, 
            lineNumber, 
            this.commentService
        );
        
        this.addCommentCodeLensDisposable = vscode.languages.registerCodeLensProvider(
            { scheme: 'file', pattern: editor.document.uri.fsPath }, 
            codeLensProvider
        );
        
        // 不设置自动清理，让CodeLens持续显示
    }

    /**
     * 显示删除评论按钮
     */
    private showDeleteCommentButton(editor: vscode.TextEditor, lineNumber: number) {
        const comments = this.commentService.getCommentsForFile(editor.document.uri.fsPath);
        const comment = comments.find(c => 
            c.anchor.originalRange.startLine <= lineNumber && 
            c.anchor.originalRange.endLine >= lineNumber
        );

        if (!comment) {
            return;
        }

        // 创建代码镜头提供者来显示删除按钮
        const codeLensProvider = new CommentCodeLensProvider(comment, this.commentService);
        const disposable = vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: '*' }, 
            codeLensProvider
        );

        // 5秒后清理
        setTimeout(() => {
            disposable.dispose();
        }, 5000);
    }

    /**
     * 创建悬浮的Add Comment Webview
     */
    private createAddCommentWebview(editor: vscode.TextEditor, lineNumber: number) {
        if (this.addCommentWebviewPanel) {
            this.addCommentWebviewPanel.dispose();
        }

        this.addCommentWebviewPanel = vscode.window.createWebviewPanel(
            'addComment',
            'Add Comment',
            {
                viewColumn: vscode.ViewColumn.Beside,
                preserveFocus: true
            },
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        this.addCommentWebviewPanel.webview.html = this.getAddCommentWebviewContent();

        // 处理webview消息
        this.addCommentWebviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'addComment':
                    await this.addCommentToLine(editor.document.uri, lineNumber, message.text);
                    this.addCommentWebviewPanel?.dispose();
                    break;
                case 'cancel':
                    this.addCommentWebviewPanel?.dispose();
                    break;
            }
        });
    }

    private getAddCommentWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                }
                .comment-container {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    padding: 12px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                textarea {
                    width: 100%;
                    min-height: 80px;
                    border: none;
                    background: transparent;
                    color: var(--vscode-input-foreground);
                    font-family: inherit;
                    resize: vertical;
                    outline: none;
                }
                .button-group {
                    display: flex;
                    gap: 8px;
                    margin-top: 12px;
                    justify-content: flex-end;
                }
                button {
                    padding: 6px 12px;
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 3px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    cursor: pointer;
                    font-size: 12px;
                }
                button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .primary {
                    background: var(--vscode-button-background);
                }
                .secondary {
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                }
            </style>
        </head>
        <body>
            <div class="comment-container">
                <textarea id="commentText" placeholder="Add your comment here..."></textarea>
                <div class="button-group">
                    <button class="secondary" onclick="cancel()">Cancel</button>
                    <button class="primary" onclick="addComment()">Add Comment</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function addComment() {
                    const text = document.getElementById('commentText').value.trim();
                    if (text) {
                        vscode.postMessage({
                            command: 'addComment',
                            text: text
                        });
                    }
                }
                
                function cancel() {
                    vscode.postMessage({ command: 'cancel' });
                }
                
                // 自动聚焦到文本框
                document.getElementById('commentText').focus();
                
                // 支持Ctrl+Enter快捷键
                document.addEventListener('keydown', function(e) {
                    if (e.ctrlKey && e.key === 'Enter') {
                        addComment();
                    }
                    if (e.key === 'Escape') {
                        cancel();
                    }
                });
            </script>
        </body>
        </html>
        `;
    }    private async addCommentToLine(uri: vscode.Uri, lineNumber: number, commentText: string) {
        try {
            // 获取当前用户
            const currentUser = this.commentService.getCurrentUser();
            
            // 获取当前选择，可以是多行
            const editor = vscode.window.activeTextEditor;
            let range;
            
            if (editor && !editor.selection.isEmpty && editor.document.uri.toString() === uri.toString()) {
                // 使用选择的实际范围
                range = {
                    startLine: editor.selection.start.line,
                    startCharacter: editor.selection.start.character,
                    endLine: editor.selection.end.line,
                    endCharacter: editor.selection.end.character
                };
            } else {
                // 备选方案：使用整行
                const document = await vscode.workspace.openTextDocument(uri);
                const line = document.lineAt(lineNumber);
                range = {
                    startLine: lineNumber,
                    startCharacter: 0,
                    endLine: lineNumber,
                    endCharacter: line.text.length
                };
            }

            // 添加评论
            await this.commentService.addComment(
                uri.toString(),
                range,
                commentText,
                currentUser
            );

            // 显示成功消息
            vscode.window.showInformationMessage('评论已添加');
            
        } catch (error) {
            console.error('添加评论失败:', error);
            vscode.window.showErrorMessage('添加评论失败');
        }
    }private hideAddCommentUI() {
        // 清理装饰器
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            activeEditor.setDecorations(this.addCommentDecorationType, []);
        }
        
        // 清理状态栏
        if (this.statusBarItem) {
            this.statusBarItem.hide();
        }
        
        // 清理webview
        if (this.addCommentWebviewPanel) {
            this.addCommentWebviewPanel.dispose();
            this.addCommentWebviewPanel = undefined;
        }

        // 注意：不清理代码镜头，让它持续显示直到选择变化或编辑器变化
    }

    /**
     * 完全清理所有UI（包括代码镜头）
     */
    private clearAllUI() {
        this.hideAddCommentUI();
        
        // 清理代码镜头
        if (this.addCommentCodeLensDisposable) {
            this.addCommentCodeLensDisposable.dispose();
            this.addCommentCodeLensDisposable = undefined;
        }
    }    /**
     * 显示简单的内联评论输入框
     */
    async showInlineCommentInput(editor: vscode.TextEditor, lineNumber: number): Promise<void> {
        // 使用简洁的输入框而不是webview来避免编辑器闪烁
        const commentText = await vscode.window.showInputBox({
            prompt: `在第 ${lineNumber + 1} 行添加评论`,
            placeHolder: '输入您的评论...',
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '评论内容不能为空';
                }
                if (value.length > 500) {
                    return '评论内容不能超过500个字符';
                }
                return null;
            }
        });

        if (commentText && commentText.trim()) {
            await this.addCommentToLine(editor.document.uri, lineNumber, commentText.trim());
        }
    }    /**
     * 在代码上方显示高级评论输入框（类似Copilot内联聊天）
     */
    private showAdvancedCommentInput(editor: vscode.TextEditor, lineNumber: number) {
        // 清理之前可能存在的评论UI
        this.hideAddCommentUI();
        
        // 创建内联评论面板
        if (this.addCommentWebviewPanel) {
            this.addCommentWebviewPanel.dispose();
        }
        
        // 计算位置 - 在选中代码的上方显示
        const selection = editor.selection;
        const startLine = selection.isEmpty ? lineNumber : selection.start.line;
        
        // 创建评论面板
        this.addCommentWebviewPanel = vscode.window.createWebviewPanel(
            'inlineComment',
            'Add Comment',
            {
                viewColumn: editor.viewColumn || vscode.ViewColumn.Active,
                preserveFocus: false
            },
            {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri],
                retainContextWhenHidden: true
            }
        );
        
        // 设置面板位置
        const position = editor.selection.isEmpty ? 
            new vscode.Position(lineNumber, 0) : 
            editor.selection.start;
        
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
        
        // 注册EventEmitter以使用VS Code的通信API
        const onDidReceiveMessage = new vscode.EventEmitter<any>();
        this.addCommentWebviewPanel.webview.onDidReceiveMessage(message => {
            onDidReceiveMessage.fire(message);
        });
        
        // 设置HTML内容
        this.addCommentWebviewPanel.webview.html = this.getInlineCommentInputHtml();
        
        // 处理消息
        this.addCommentWebviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'addComment':
                    await this.addCommentToLine(editor.document.uri, lineNumber, message.text);
                    this.addCommentWebviewPanel?.dispose();
                    break;
                case 'cancel':
                    this.addCommentWebviewPanel?.dispose();
                    break;
            }
        });
        
        // 设置面板关闭事件
        this.addCommentWebviewPanel.onDidDispose(() => {
            this.addCommentWebviewPanel = undefined;
        });
    }
    
    /**
     * 获取内联评论输入框的HTML内容
     */
    private getInlineCommentInputHtml(): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                }
                .comment-container {
                    display: flex;
                    flex-direction: column;
                    padding: 8px;
                    border-left: 3px solid #3794ff;
                    background-color: var(--vscode-editor-inlineChat-background, rgba(255, 255, 255, 0.05));
                }
                .input-container {
                    display: flex;
                    flex-direction: column;
                }
                textarea {
                    width: calc(100% - 16px);
                    min-height: 60px;
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border, transparent);
                    border-radius: 3px;
                    resize: vertical;
                    font-family: inherit;
                    font-size: inherit;
                    outline: none;
                }
                .actions {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 8px;
                    gap: 8px;
                }
                button {
                    padding: 4px 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: inherit;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .cancel-button {
                    background-color: transparent;
                    border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
                }
                .header {
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: var(--vscode-editor-foreground);
                }
            </style>
        </head>
        <body>
            <div class="comment-container">
                <div class="header">Add Comment</div>
                <div class="input-container">
                    <textarea id="commentInput" placeholder="输入评论..." autofocus></textarea>
                </div>
                <div class="actions">
                    <button class="cancel-button" id="cancelButton">取消</button>
                    <button id="submitButton">提交评论</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const textarea = document.getElementById('commentInput');
                const submitButton = document.getElementById('submitButton');
                const cancelButton = document.getElementById('cancelButton');
                
                // 自动聚焦文本区域
                textarea.focus();
                
                // 提交按钮点击事件
                submitButton.addEventListener('click', () => {
                    const text = textarea.value.trim();
                    if (text) {
                        vscode.postMessage({
                            command: 'addComment',
                            text: text
                        });
                    }
                });
                
                // 取消按钮点击事件
                cancelButton.addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });
                
                // 按键事件处理器
                textarea.addEventListener('keydown', (e) => {
                    // Ctrl+Enter 提交评论
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        const text = textarea.value.trim();
                        if (text) {
                            vscode.postMessage({
                                command: 'addComment',
                                text: text
                            });
                        }
                    }
                    
                    // Escape 取消
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        vscode.postMessage({ command: 'cancel' });
                    }
                });
            </script>
        </body>
        </html>`;
    }    /**
     * 显示真正的内联评论输入框（革命性改进 - 真正的内联体验）
     * 使用 snippet 技术实现真正的内联输入，类似 GitHub Copilot 的内联聊天
     */
    async showCopilotStyleCommentInput(editor: vscode.TextEditor, lineNumber?: number): Promise<void> {
        const selection = editor.selection;
        let targetLine = lineNumber ?? selection.start.line;
        let isMultiLine = false;
        let lineRange = '';

        // 确定选择范围和提示文本
        if (!selection.isEmpty) {
            isMultiLine = selection.start.line !== selection.end.line;
            if (isMultiLine) {
                lineRange = `第 ${selection.start.line + 1}-${selection.end.line + 1} 行`;
            } else {
                lineRange = `第 ${selection.start.line + 1} 行`;
            }
            targetLine = selection.start.line;
        } else {
            lineRange = `第 ${targetLine + 1} 行`;
        }

        // 保存原始选择范围
        const originalSelection = new vscode.Selection(selection.start, selection.end);

        try {
            // 创建真正的内联评论输入体验
            await this.createInlineCommentInput(editor, targetLine, originalSelection, isMultiLine, lineRange);

        } catch (error) {
            console.error('Error in showCopilotStyleCommentInput:', error);
            vscode.window.showErrorMessage('添加评论时发生错误');
        }
    }

    /**
     * 创建真正的内联评论输入 - 使用 snippet 技术实现革命性体验
     */
    private async createInlineCommentInput(
        editor: vscode.TextEditor, 
        targetLine: number, 
        originalSelection: vscode.Selection,
        isMultiLine: boolean,
        lineRange: string
    ): Promise<void> {
        // 在目标行上方插入内联评论输入
        const insertPosition = new vscode.Position(targetLine, 0);
        
        // 创建评论输入的 snippet - 这是关键创新！
        const commentSnippet = new vscode.SnippetString(
            `// 💬 Comment: \${1:请输入评论内容...}\n`
        );

        // 创建装饰类型以高亮显示正在评论的代码
        const highlightDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 122, 204, 0.1)',
            border: '1px solid rgba(0, 122, 204, 0.3)',
            borderRadius: '3px'
        });

        // 应用高亮装饰到原始选择
        let decorationRange: vscode.Range;
        if (!originalSelection.isEmpty) {
            // 调整范围以适应新插入的行
            decorationRange = new vscode.Range(
                originalSelection.start.line + 1,
                originalSelection.start.character,
                originalSelection.end.line + 1,
                originalSelection.end.character
            );
        } else {
            const line = editor.document.lineAt(targetLine + 1);
            decorationRange = new vscode.Range(targetLine + 1, 0, targetLine + 1, line.text.length);
        }

        // 插入 snippet 并等待用户输入
        const insertSuccess = await editor.insertSnippet(commentSnippet, insertPosition);
        
        if (!insertSuccess) {
            vscode.window.showErrorMessage('无法创建内联评论输入');
            return;
        }

        // 应用高亮装饰
        editor.setDecorations(highlightDecorationType, [decorationRange]);

        // 创建文档变化监听器来检测用户完成输入
        let documentChangeListener: vscode.Disposable | undefined;
        let selectionChangeListener: vscode.Disposable | undefined;
        let isProcessing = false;
        
        const cleanupAndProcess = async () => {
            if (isProcessing) return;
            isProcessing = true;

            // 清理监听器和装饰
            if (documentChangeListener) {
                documentChangeListener.dispose();
                documentChangeListener = undefined;
            }
            if (selectionChangeListener) {
                selectionChangeListener.dispose();
                selectionChangeListener = undefined;
            }
            highlightDecorationType.dispose();

            // 获取用户输入的内容
            try {
                const currentLine = editor.document.lineAt(targetLine);
                const commentMatch = currentLine.text.match(/\/\/ 💬 Comment: (.+)/);
                
                if (commentMatch && commentMatch[1] && commentMatch[1].trim() !== '请输入评论内容...') {
                    const commentText = commentMatch[1].trim();
                    
                    // 删除临时的评论行
                    await editor.edit(editBuilder => {
                        editBuilder.delete(new vscode.Range(targetLine, 0, targetLine + 1, 0));
                    });

                    // 创建真正的评论
                    await this.createActualComment(editor, originalSelection, commentText, isMultiLine);
                    
                    // 显示成功消息
                    vscode.window.setStatusBarMessage('✅ 评论已添加', 2000);
                } else {
                    // 用户取消或没有输入有效内容，删除临时行
                    await editor.edit(editBuilder => {
                        editBuilder.delete(new vscode.Range(targetLine, 0, targetLine + 1, 0));
                    });
                }
            } catch (error) {
                console.error('Error processing comment input:', error);
                // 尝试清理临时行
                try {
                    await editor.edit(editBuilder => {
                        editBuilder.delete(new vscode.Range(targetLine, 0, targetLine + 1, 0));
                    });
                } catch (cleanupError) {
                    console.error('Error cleaning up temporary line:', cleanupError);
                }
            }
        };

        // 监听选择变化 - 当用户完成 snippet 编辑时
        selectionChangeListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
            if (event.textEditor !== editor) return;
            
            // 检查是否离开了评论行
            const currentSelection = event.selections[0];
            if (currentSelection.start.line !== targetLine) {
                // 用户移动到其他行，处理评论
                setTimeout(cleanupAndProcess, 100);
            }
        });

        // 监听文档变化 - 检测特定的结束条件
        documentChangeListener = vscode.workspace.onDidChangeTextDocument(async (event) => {
            if (event.document !== editor.document) return;
            
            // 检查是否是在评论行的变化
            for (const change of event.contentChanges) {
                const changedLine = change.range.start.line;
                if (changedLine === targetLine) {
                    // 检查是否按了 Enter 键（表示完成输入）
                    if (change.text.includes('\n')) {
                        setTimeout(cleanupAndProcess, 100);
                        return;
                    }
                }
            }
        });

        // 设置一个备用的清理机制 - 如果用户切换了编辑器
        const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(() => {
            setTimeout(cleanupAndProcess, 50);
        });

        // 15秒后自动清理（防止遗留）
        setTimeout(() => {
            cleanupAndProcess();
            editorChangeListener.dispose();
        }, 15000);
    }

    /**
     * 创建实际的评论对象
     */
    private async createActualComment(
        editor: vscode.TextEditor,
        originalSelection: vscode.Selection,
        commentText: string,
        isMultiLine: boolean
    ): Promise<void> {
        // 创建评论范围
        let commentRange: CommentRange;
        if (!originalSelection.isEmpty) {
            commentRange = {
                startLine: originalSelection.start.line,
                startCharacter: originalSelection.start.character,
                endLine: originalSelection.end.line,
                endCharacter: originalSelection.end.character
            };
        } else {
            const line = editor.document.lineAt(originalSelection.start.line);
            commentRange = {
                startLine: originalSelection.start.line,
                startCharacter: 0,
                endLine: originalSelection.start.line,
                endCharacter: line.text.length
            };
        }

        // 添加评论
        const comment = await this.commentService.addComment(
            editor.document.uri.toString(),
            commentRange,
            commentText,
            this.commentService.getCurrentUser()
        );
    }
    
    /**
     * 获取Copilot风格评论输入HTML
     */
    private getCopilotStyleCommentHtml(): string {
        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {
                    padding: 0;
                    margin: 0;
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                }
                .comment-container {
                    display: flex;
                    flex-direction: column;
                    padding: 8px;
                    border-left: 3px solid #3794ff;
                    background-color: var(--vscode-editor-inlineChat-background, rgba(255, 255, 255, 0.05));
                }
                .input-container {
                    display: flex;
                    flex-direction: column;
                }
                textarea {
                    width: calc(100% - 16px);
                    min-height: 60px;
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border, transparent);
                    border-radius: 3px;
                    resize: vertical;
                    font-family: inherit;
                    font-size: inherit;
                    outline: none;
                }
                .actions {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 8px;
                    gap: 8px;
                }
                button {
                    padding: 4px 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 2px;
                    cursor: pointer;
                    font-family: inherit;
                    font-size: inherit;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .cancel-button {
                    background-color: transparent;
                    border: 1px solid var(--vscode-button-border, var(--vscode-button-background));
                }
                .header {
                    font-weight: bold;
                    margin-bottom: 8px;
                    color: var(--vscode-editor-foreground);
                }
            </style>
        </head>
        <body>
            <div class="comment-container">
                <div class="header">Add Comment</div>
                <div class="input-container">
                    <textarea id="commentInput" placeholder="输入评论..." autofocus></textarea>
                </div>
                <div class="actions">
                    <button class="cancel-button" id="cancelButton">取消</button>
                    <button id="submitButton">提交评论</button>
                </div>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                const textarea = document.getElementById('commentInput');
                const submitButton = document.getElementById('submitButton');
                const cancelButton = document.getElementById('cancelButton');
                
                // 自动聚焦文本区域
                textarea.focus();
                
                // 提交按钮点击事件
                submitButton.addEventListener('click', () => {
                    const text = textarea.value.trim();
                    if (text) {
                        vscode.postMessage({
                            command: 'addComment',
                            text: text
                        });
                    }
                });
                
                // 取消按钮点击事件
                cancelButton.addEventListener('click', () => {
                    vscode.postMessage({ command: 'cancel' });
                });
                
                // 按键事件处理器
                textarea.addEventListener('keydown', (e) => {
                    // Ctrl+Enter 提交评论
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        const text = textarea.value.trim();
                        if (text) {
                            vscode.postMessage({
                                command: 'addComment',
                                text: text
                            });
                        }
                    }
                    
                    // Escape 取消
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        vscode.postMessage({ command: 'cancel' });
                    }
                });
            </script>
        </body>
        </html>`;
    }
    /**
     * 显示真正的内联聊天窗口（使用新的 InlineChatWidget）
     */
    async showInlineChatWindow(editor: vscode.TextEditor, lineNumber?: number): Promise<void> {
        try {
            // 使用新的内联聊天小部件
            await this.inlineChatWidget.showInlineChat(editor, lineNumber);
        } catch (error) {
            console.error('Error showing inline chat window:', error);
            vscode.window.showErrorMessage('显示内联聊天窗口时发生错误');
        }
    }    dispose() {
        this.hideAddCommentUI();
        
        // 清理装饰类型
        if (this.addCommentDecorationType) {
            this.addCommentDecorationType.dispose();
        }
        
        // 清理状态栏
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
        }
        
        // 清理内联聊天小部件
        if (this.inlineChatWidget) {
            this.inlineChatWidget.dispose();
        }
        
        this.disposables.forEach(d => d.dispose());
    }
}

/**
 * CodeLens提供者 - 用于显示删除评论按钮
 */
class CommentCodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        private comment: Comment,
        private commentService: CommentService
    ) {}

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const range = new vscode.Range(
            this.comment.anchor.originalRange.startLine,
            0,
            this.comment.anchor.originalRange.startLine,
            0
        );

        const deleteLens = new vscode.CodeLens(range, {
            title: "$(trash) Delete Comment",
            command: 'code-review-notes.deleteComment',
            arguments: [this.comment.id]
        });

        const replyLens = new vscode.CodeLens(range, {
            title: "$(reply) Reply",
            command: 'code-review-notes.replyToComment',
            arguments: [this.comment]
        });

        return [deleteLens, replyLens];
    }
}

/**
 * 添加评论 CodeLens 提供者
 */
class AddCommentCodeLensProvider implements vscode.CodeLensProvider {
    constructor(
        private uri: vscode.Uri,
        private lineNumber: number,
        private commentService: CommentService
    ) {}

    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        // 只为指定的文档和行提供CodeLens
        if (document.uri.toString() !== this.uri.toString()) {
            return [];
        }

        // 放置在选择范围的起始行
        const editor = vscode.window.activeTextEditor;
        let range;
        
        if (editor && !editor.selection.isEmpty && 
            editor.document.uri.toString() === this.uri.toString()) {
            // 使用选择的起始行
            range = new vscode.Range(editor.selection.start.line, 0, editor.selection.start.line, 0);
        } else {
            // 使用指定的行
            range = new vscode.Range(this.lineNumber, 0, this.lineNumber, 0);
        }

        const addCommentLens = new vscode.CodeLens(range, {
            title: "$(comment-add) Add Comment",
            command: 'code-review-notes.addCommentInline',  // 使用新命令
            arguments: [this.uri, this.lineNumber],
            tooltip: "点击添加评论"
        });

        return [addCommentLens];
    }
}
