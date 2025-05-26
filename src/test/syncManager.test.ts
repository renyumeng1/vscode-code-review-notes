import * as assert from 'assert';
import * as vscode from 'vscode';
import { SyncManager } from '../syncManager';
import { SyncMethod } from '../syncStrategy';

suite('SyncManager Test Suite', () => {
    let syncManager: SyncManager;
    let mockContext: vscode.ExtensionContext;

    setup(() => {        // 创建模拟的扩展上下文
        mockContext = {
            workspaceState: {
                get: (key: string) => undefined,
                update: (key: string, value: any) => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: (key: string) => undefined,
                update: (key: string, value: any) => Promise.resolve(),
                setKeysForSync: (keys: string[]) => {},
                keys: () => []
            },
            extensionPath: '',
            extensionUri: vscode.Uri.file(''),
            environmentVariableCollection: {} as any,
            subscriptions: [],
            asAbsolutePath: (relativePath: string) => relativePath,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: vscode.Uri.file(''),
            globalStoragePath: '',
            logUri: vscode.Uri.file(''),
            logPath: '',
            extensionMode: vscode.ExtensionMode.Test,
            extension: {} as any,
            secrets: {} as any,
            languageModelAccessInformation: {} as any
        };

        syncManager = new SyncManager(mockContext);
    });

    test('SyncManager initialization', () => {
        assert.ok(syncManager);
        assert.strictEqual(syncManager.getCurrentSyncMethod(), SyncMethod.Local);
    });

    test('SyncManager method switching', async () => {
        // 测试切换到 Git 方法
        await syncManager.setSyncMethod(SyncMethod.Git);
        assert.strictEqual(syncManager.getCurrentSyncMethod(), SyncMethod.Git);

        // 测试切换到服务器方法
        await syncManager.setSyncMethod(SyncMethod.Server);
        assert.strictEqual(syncManager.getCurrentSyncMethod(), SyncMethod.Server);

        // 测试切换回本地方法
        await syncManager.setSyncMethod(SyncMethod.Local);
        assert.strictEqual(syncManager.getCurrentSyncMethod(), SyncMethod.Local);
    });

    test('SyncManager save and load comments', async () => {
        const testComments = [
            {
                id: 'test-1',
                text: 'Test comment 1',
                author: 'TestUser',
                timestamp: Date.now(),
                range: {
                    startLine: 0,
                    startCharacter: 0,
                    endLine: 0,
                    endCharacter: 10
                },
                documentUri: 'test://test.ts',
                resolved: false,
                replies: []
            }
        ];

        // 测试保存评论
        const saveResult = await syncManager.saveComments(testComments);
        assert.ok(saveResult.success);

        // 测试加载评论
        const loadedComments = await syncManager.loadComments();
        assert.strictEqual(loadedComments.length, 1);
        assert.strictEqual(loadedComments[0].text, 'Test comment 1');
    });

    test('SyncManager sync status', async () => {
        const status = await syncManager.getSyncStatus();
        assert.ok(typeof status === 'string');
        assert.ok(status.length > 0);
    });
});
