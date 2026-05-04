const fs = require('fs');
const path = require('path');

const viewsDir = path.join('c:\\Users\\shonp\\Downloads\\MiRestconIA', 'views');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.ejs')) results.push(file);
        }
    });
    return results;
}

const ejsFiles = walk(viewsDir);
let changedCount = 0;

ejsFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let changed = false;

    // 1. Script loading: Add defer to <script src="/js/...">
    const oldContent1 = content;
    content = content.replace(/<script\s+([^>]*?src="\/js\/[^"]+"[^>]*?)>/gi, (match, p1) => {
        if (!/\bdefer\b/i.test(p1)) {
            changed = true;
            return `<script ${p1} defer>`;
        }
        return match;
    });

    // 2. Page identification: Add data-page to body
    const basename = path.basename(file, '.ejs');
    const bodyRegex = /<body(?![^>]*data-page)([^>]*)>/i;
    if (bodyRegex.test(content)) {
        content = content.replace(bodyRegex, `<body data-page="${basename}"$1>`);
        changed = true;
    }

    // 3. Inline JS cleanup
    if (['login.ejs', 'dashboard.ejs', 'mesas.ejs', 'pedidos.ejs', 'mesas-desktop.ejs', 'dashboard-desktop.ejs', 'pedidos-desktop.ejs'].includes(path.basename(file))) {
        // Remove script blocks without src
        const scriptBlocksRegex = /<script(?: type="text\/javascript")?>([\s\S]*?)<\/script>/gi;
        content = content.replace(scriptBlocksRegex, (match, code) => {
            // Keep config blocks
            if (/window\.[a-zA-Z_]+Config\s*=|window\.__USER_ROLE__|window\.__USER_ID__/.test(code) || (code.includes('window.') && code.split('\n').length <= 10)) {
                return match;
            }
            // Remove logic blocks that have been refactored
            changed = true;
            return '';
        });
    }

    if (changed) {
        fs.writeFileSync(file, content, 'utf8');
        changedCount++;
    }
});

console.log(`Updated ${changedCount} files.`);
