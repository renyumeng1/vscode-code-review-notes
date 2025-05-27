import * as vscode from 'vscode';
import { CommentService } from './commentService';
import { Comment } from './types';

/**
 * 内联评论UI管理器 - 类似Cursor的评论交互体验
 * 负责显示悬浮的"Add Comment"按钮和删除评论按钮
 */
export class InlineCommentUIManager {    private disposables: vscode.Disposable[] = [];
    private addCommentWebviewPanel: vscode.WebviewPanel | undefined;
    private currentHoverLine: number = -1;
    private isHovering: boolean = false;
    private hoverTimeout: NodeJS.Timeout | undefined;
    private addCommentDecorationType: vscode.TextEditorDecorationType;
    private statusBarItem: vscode.StatusBarItem | undefined;    private addCommentCodeLensDisposable: vscode.Disposable | undefined;constructor(
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
            
            // 创建评论范围（整行）
            const document = await vscode.workspace.openTextDocument(uri);
            const line = document.lineAt(lineNumber);
            const range = {
                startLine: lineNumber,
                startCharacter: 0,
                endLine: lineNumber,
                endCharacter: line.text.length
            };

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
     * 显示内联评论输入框（类似Copilot内联聊天体验）
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
    }

    /**
     * 获取内联评论输入框的HTML（类似Copilot风格）
     */
    private getInlineCommentInputHTML(lineNumber: number): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 0;
                    margin: 0;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 6px;
                    overflow: hidden;
                    max-width: 500px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                .header {
                    background: var(--vscode-titleBar-activeBackground);
                    color: var(--vscode-titleBar-activeForeground);
                    padding: 8px 12px;
                    font-size: 12px;
                    font-weight: 500;
                    border-bottom: 1px solid var(--vscode-input-border);
                }
                .input-container {
                    padding: 12px;
                }
                .textarea-wrapper {
                    position: relative;
                    background: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    overflow: hidden;
                }
                textarea {
                    width: 100%;
                    min-height: 60px;
                    max-height: 200px;
                    border: none;
                    background: transparent;
                    color: var(--vscode-input-foreground);
                    font-family: inherit;
                    font-size: 13px;
                    line-height: 1.4;
                    resize: vertical;
                    outline: none;
                    padding: 8px 10px;
                    box-sizing: border-box;
                }
                textarea:focus {
                    outline: none;
                }
                .textarea-wrapper:focus-within {
                    border-color: var(--vscode-focusBorder);
                    box-shadow: 0 0 0 1px var(--vscode-focusBorder);
                }
                .button-group {
                    display: flex;
                    gap: 8px;
                    margin-top: 10px;
                    justify-content: flex-end;
                }
                button {
                    padding: 6px 12px;
                    border: 1px solid var(--vscode-button-border);
                    border-radius: 3px;
                    background: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    cursor: pointer;
                    font-size: 12px;
                    font-family: inherit;
                    transition: background-color 0.2s ease;
                }
                button:hover {
                    background: var(--vscode-button-secondaryHoverBackground);
                }
                .primary {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .primary:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .primary:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .placeholder {
                    color: var(--vscode-input-placeholderForeground);
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="header">
                💬 添加评论到第 ${lineNumber + 1} 行
            </div>
            <div class="input-container">
                <div class="textarea-wrapper">
                    <textarea 
                        id="commentText" 
                        placeholder="输入您的评论..."
                        autocomplete="off"
                        spellcheck="false"></textarea>
                </div>
                <div class="button-group">
                    <button onclick="cancel()">取消</button>
                    <button class="primary" id="addButton" onclick="addComment()" disabled>添加评论</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const textarea = document.getElementById('commentText');
                const addButton = document.getElementById('addButton');
                
                // 自动聚焦到文本框
                textarea.focus();
                
                // 监听输入变化，控制按钮状态
                textarea.addEventListener('input', function() {
                    const hasText = textarea.value.trim().length > 0;
                    addButton.disabled = !hasText;
                });
                
                function addComment() {
                    const text = textarea.value.trim();
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
                
                // 支持键盘快捷键
                textarea.addEventListener('keydown', function(e) {
                    if (e.ctrlKey && e.key === 'Enter' && !addButton.disabled) {
                        addComment();
                    }
                    if (e.key === 'Escape') {
                        cancel();
                    }
                });
                
                // 自动调整高度
                textarea.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
                });
            </script>
        </body>
        </html>
        `;
    }

    dispose() {
        this.hideAddCommentUI();
        
        // 清理装饰类型
        if (this.addCommentDecorationType) {
            this.addCommentDecorationType.dispose();
        }
        
        // 清理状态栏
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
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

        const range = new vscode.Range(this.lineNumber, 0, this.lineNumber, 0);

        const addCommentLens = new vscode.CodeLens(range, {
            title: "$(comment-add) Add Comment",
            command: 'code-review-notes.addCommentToLine',
            arguments: [this.uri, this.lineNumber],
            tooltip: "点击添加评论"
        });

        return [addCommentLens];
    }
}
