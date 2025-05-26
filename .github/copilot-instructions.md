<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Code Review Notes VS Code Extension

This is a VS Code extension project for adding code review comments similar to Overleaf. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Overview
- **Purpose**: Provide code review functionality with commenting, replying, and resolving comments
- **Features**: 
  - Add comments to selected text
  - Display comments in sidebar tree view
  - Reply to comments
  - Resolve/unresolve comments
  - Persist comments using workspace state

## Technical Details
- **Language**: TypeScript
- **Framework**: VS Code Extension API
- **Key APIs Used**:
  - `vscode.TreeDataProvider` for sidebar view
  - `vscode.commands` for command registration
  - `vscode.workspace.workspaceState` for data persistence
  - `vscode.window.showInputBox` for user input
  - `vscode.TextEditorDecorationType` for text highlighting

## Data Model
```typescript
interface CommentRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

interface CommentReply {
  id: string;
  parentId: string;
  author: string;
  text: string;
  timestamp: number;
}

interface Comment {
  id: string;
  documentUri: string;
  range: CommentRange;
  text: string;
  author: string;
  timestamp: number;
  resolved: boolean;
  replies: CommentReply[];
}
```

## Development Guidelines
- Follow TypeScript best practices
- Use VS Code API conventions
- Implement proper error handling
- Keep UI responsive and intuitive
- Ensure data persistence works correctly
