// 自动化验证脚本 - 智能评论位置跟踪系统
// 此脚本用于验证v0.1.2版本的修复效果

const fs = require('fs');
const path = require('path');

console.log('🔍 开始验证智能评论位置跟踪系统...');
console.log('📅 测试时间:', new Date().toLocaleString('zh-CN'));
console.log('📦 扩展版本: v0.1.2');
console.log('');

// 测试用例数据
const testCases = [
    {
        name: '回车键插入测试',
        description: '验证按回车键后评论位置不失效',
        severity: 'CRITICAL',
        expectedBehavior: '评论位置自动调整到正确行'
    },
    {
        name: '多行插入测试', 
        description: '验证插入多行代码后位置跟踪',
        severity: 'HIGH',
        expectedBehavior: '评论位置向下偏移对应行数'
    },
    {
        name: '代码修改测试',
        description: '验证轻微修改代码后位置保持',
        severity: 'MEDIUM',
        expectedBehavior: '评论继续跟踪修改后的代码行'
    },
    {
        name: '响应速度测试',
        description: '验证300ms快速响应',
        severity: 'HIGH', 
        expectedBehavior: '位置更新在300ms内完成'
    },
    {
        name: '置信度系统测试',
        description: '验证分级置信度要求',
        severity: 'MEDIUM',
        expectedBehavior: '短距离60%，中距离70%，远距离80%'
    }
];

// 验证核心文件是否存在
const coreFiles = [
    'src/commentPositionTracker.ts',
    'src/commentService.ts', 
    'src/extension.ts',
    'package.json'
];

console.log('📁 验证核心文件...');
coreFiles.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${file} - 存在`);
    } else {
        console.log(`  ❌ ${file} - 缺失`);
    }
});

console.log('');
console.log('📋 测试用例列表:');
testCases.forEach((testCase, index) => {
    console.log(`  ${index + 1}. ${testCase.name} [${testCase.severity}]`);
    console.log(`     描述: ${testCase.description}`);
    console.log(`     期望: ${testCase.expectedBehavior}`);
    console.log('');
});

// 检查扩展包文件
const vsixFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.vsix'));
console.log('📦 可用的扩展包:');
vsixFiles.forEach(file => {
    const stats = fs.statSync(path.join(__dirname, file));
    console.log(`  📄 ${file} (${(stats.size / 1024).toFixed(1)} KB)`);
});

console.log('');
console.log('🚀 验证建议:');
console.log('1. 在VS Code中打开 test-position-tracking-demo.js');
console.log('2. 使用 Ctrl+Shift+C 添加评论到代码行');
console.log('3. 按回车键插入空行，观察评论位置');
console.log('4. 进行代码编辑，验证位置跟踪');
console.log('5. 检查开发者工具控制台的日志信息');

console.log('');
console.log('⚡ 关键修复功能:');
console.log('- tryAdjustLineOffset: 智能行号偏移调整');
console.log('- 增强置信度系统: 分级验证要求');  
console.log('- 前置上下文匹配: 5行搜索范围');
console.log('- 实时响应: 300ms快速响应');

console.log('');
console.log('✨ 验证完成，请在VS Code中进行实际测试！');
