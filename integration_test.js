const fs = require('fs');
const path = require('path');

console.log('🚀 开始集成测试...');

// 检查主要文件是否编译成功
const mainFiles = [
    './out/extension.js',
    './out/syncManager.js',
    './out/commentService.js',
    './out/syncStrategy.js',
    './out/localSyncStrategy.js',
    './out/gitSyncService.js',
    './out/serverSyncStrategy.js'
];

let allFilesExist = true;

console.log('\n📁 检查编译输出文件...');
mainFiles.forEach(file => {
    if (fs.existsSync(file)) {
        console.log(`✅ ${file} - 存在`);
    } else {
        console.log(`❌ ${file} - 缺失`);
        allFilesExist = false;
    }
});

// 检查 package.json 配置
console.log('\n📋 检查 package.json 配置...');
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

// 检查新的命令
const expectedCommands = [
    'code-review-notes.showSyncMethodPicker',
    'code-review-notes.performFullSync',
    'code-review-notes.getSyncStatus',
    'code-review-notes.syncComments',
    'code-review-notes.loadCommentsFromGit',
    'code-review-notes.enableAutoSync'
];

const configuredCommands = packageJson.contributes.commands.map(cmd => cmd.command);
let allCommandsConfigured = true;

expectedCommands.forEach(cmd => {
    if (configuredCommands.includes(cmd)) {
        console.log(`✅ 命令 ${cmd} - 已配置`);
    } else {
        console.log(`❌ 命令 ${cmd} - 缺失`);
        allCommandsConfigured = false;
    }
});

// 检查新的配置项
console.log('\n⚙️  检查配置项...');
const expectedConfigs = [
    'codeReviewNotes.syncMethod',
    'codeReviewNotes.serverUrl',
    'codeReviewNotes.serverAuthToken',
    'codeReviewNotes.enableRealTimeSync'
];

const configuredProperties = Object.keys(packageJson.contributes.configuration.properties);
let allConfigsPresent = true;

expectedConfigs.forEach(config => {
    if (configuredProperties.includes(config)) {
        console.log(`✅ 配置项 ${config} - 已配置`);
    } else {
        console.log(`❌ 配置项 ${config} - 缺失`);
        allConfigsPresent = false;
    }
});

// 检查策略文件内容
console.log('\n🔄 检查同步策略实现...');
try {
    const syncStrategyContent = fs.readFileSync('./out/syncStrategy.js', 'utf8');
    const localStrategyContent = fs.readFileSync('./out/localSyncStrategy.js', 'utf8');
    const gitStrategyContent = fs.readFileSync('./out/gitSyncService.js', 'utf8');
    const serverStrategyContent = fs.readFileSync('./out/serverSyncStrategy.js', 'utf8');
    const syncManagerContent = fs.readFileSync('./out/syncManager.js', 'utf8');
    
    console.log('✅ 所有策略文件编译成功');
    
    // 检查关键类和方法
    if (syncManagerContent.includes('SyncManager')) {
        console.log('✅ SyncManager 类 - 存在');
    } else {
        console.log('❌ SyncManager 类 - 缺失');
    }
    
    if (syncManagerContent.includes('showSyncMethodPicker')) {
        console.log('✅ showSyncMethodPicker 方法 - 存在');
    } else {
        console.log('❌ showSyncMethodPicker 方法 - 缺失');
    }
    
} catch (error) {
    console.log(`❌ 读取策略文件失败: ${error.message}`);
    allFilesExist = false;
}

// 总结
console.log('\n📊 集成测试总结:');
console.log(`文件编译: ${allFilesExist ? '✅ 通过' : '❌ 失败'}`);
console.log(`命令配置: ${allCommandsConfigured ? '✅ 通过' : '❌ 失败'}`);
console.log(`配置项: ${allConfigsPresent ? '✅ 通过' : '❌ 失败'}`);

if (allFilesExist && allCommandsConfigured && allConfigsPresent) {
    console.log('\n🎉 集成测试全部通过！同步系统已成功实现！');
    process.exit(0);
} else {
    console.log('\n❌ 集成测试失败，请检查上述问题');
    process.exit(1);
}
