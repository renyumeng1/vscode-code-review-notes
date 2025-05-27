import * as vscode from 'vscode';
import { CommentService } from './commentService';
import { CommentRange } from './types';

/**
 * 真正的内联聊天窗口组件 - 类似GitHub Copilot的内联聊天
 * 使用VS Code原生输入框实现真正的内联体验
 */
export class InlineChatWidget {
    private disposables: vscode.Disposable[] = [];
    private chatDecorationType: vscode.TextEditorDecorationType;
    private isActive: boolean = false;
    private currentEditor?: vscode.TextEditor;
    private currentLine?: number;
    private originalSelection?: vscode.Selection;

    constructor(
        private context: vscode.ExtensionContext,
        private commentService: CommentService
    ) {
        this.chatDecorationType = this.createChatDecorationType();
        this.setupEventListeners();
    }

    /**
     * 创建内联聊天装饰类型
     */
    private createChatDecorationType(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            isWholeLine: false,
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
            after: {
                contentText: '',
                width: '0px',
                height: '0px'
            }
        });
    }

    /**
     * 显示内联聊天窗口 - GitHub Copilot风格
     */
    async showInlineChat(editor: vscode.TextEditor, line?: number): Promise<void> {
        // 清理之前的聊天窗口
        this.dispose();

        this.currentEditor = editor;
        this.originalSelection = new vscode.Selection(editor.selection.start, editor.selection.end);
        
        // 确定聊天窗口的位置
        const targetLine = line ?? editor.selection.start.line;
        this.currentLine = targetLine;

        // 创建内联聊天的视觉效果
        await this.createInlineChatVisual(editor, targetLine);

        // 显示GitHub Copilot风格的输入框
        await this.showInlineInputBox(editor, targetLine);

        this.isActive = true;
    }

    /**
     * 创建内联聊天的视觉效果
     */
    private async createInlineChatVisual(editor: vscode.TextEditor, line: number): Promise<void> {
        // 高亮被评论的代码行
        if (this.originalSelection && !this.originalSelection.isEmpty) {
            const highlightDecorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(0, 122, 204, 0.08)',
                border: '1px solid rgba(0, 122, 204, 0.2)',
                borderRadius: '3px',
                isWholeLine: false,
                overviewRulerColor: 'rgba(0, 122, 204, 0.6)',
                overviewRulerLane: vscode.OverviewRulerLane.Right
            });

            const highlightRange = new vscode.Range(
                this.originalSelection.start.line,
                this.originalSelection.start.character,
                this.originalSelection.end.line,
                this.originalSelection.end.character
            );

            editor.setDecorations(highlightDecorationType, [{ range: highlightRange }]);

            // 保存装饰类型以便后续清理
            this.disposables.push(highlightDecorationType);
        }

        // 将光标移动到目标行并居中显示
        const newPosition = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
        editor.revealRange(
            new vscode.Range(newPosition, newPosition), 
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
    }    /**
     * 显示GitHub Copilot风格的内联输入框
     */
    private async showInlineInputBox(editor: vscode.TextEditor, line: number): Promise<void> {
        // 使用VS Code原生的输入框，在当前位置显示
        const inputOptions: vscode.InputBoxOptions = {
            placeHolder: '输入评论...',
            prompt: '💬 添加评论',
            value: '',
            validateInput: (value) => {
                if (value.trim().length === 0) {
                    return '请输入内容';
                }
                if (value.length > 500) {
                    return '内容过长';
                }
                return undefined;
            }
        };        try {
            // 显示输入框
            const comment = await vscode.window.showInputBox(inputOptions);
            
            if (comment !== undefined && comment.trim().length > 0) {
                await this.handleCommentSubmission(editor, line, comment.trim());
                vscode.window.showInformationMessage(`✅ 已添加评论`);
            } else {
                // 用户取消了输入
                vscode.window.showInformationMessage('❌ 已取消');
            }
        } catch (error) {
            console.error('内联聊天输入错误:', error);
            vscode.window.showErrorMessage('添加失败');
        } finally {
            // 清理资源
            this.dispose();
        }
    }

    /**
     * 处理评论提交
     */
    private async handleCommentSubmission(
        editor: vscode.TextEditor,
        line: number,
        commentText: string
    ): Promise<void> {
        try {
            // 创建评论范围
            let commentRange: CommentRange;
            
            if (this.originalSelection && !this.originalSelection.isEmpty) {
                // 如果有选中的文本，评论选中的范围
                commentRange = {
                    startLine: this.originalSelection.start.line,
                    startCharacter: this.originalSelection.start.character,
                    endLine: this.originalSelection.end.line,
                    endCharacter: this.originalSelection.end.character
                };
            } else {
                // 否则评论整行
                const targetLine = editor.document.lineAt(line);
                commentRange = {
                    startLine: line,
                    startCharacter: 0,
                    endLine: line,
                    endCharacter: targetLine.text.length
                };
            }

            // 添加评论
            await this.commentService.addComment(
                editor.document.uri.toString(),
                commentRange,
                commentText.trim(),
                this.commentService.getCurrentUser()
            );

            // 刷新评论显示
            vscode.commands.executeCommand('code-review-notes.refreshComments');        } catch (error) {
            console.error('添加评论失败:', error);
            vscode.window.showErrorMessage('添加失败');
        }
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听编辑器变化
        const editorChangeHandler = vscode.window.onDidChangeActiveTextEditor(() => {
            if (this.isActive) {
                this.dispose();
            }
        });

        this.disposables.push(editorChangeHandler);
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 清理装饰
        if (this.currentEditor) {
            this.currentEditor.setDecorations(this.chatDecorationType, []);
        }

        // 清理所有资源
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // 重置状态
        this.isActive = false;
        this.currentEditor = undefined;
        this.currentLine = undefined;
        this.originalSelection = undefined;
    }
}
