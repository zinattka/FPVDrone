// Execute the actual SWF in headless Chromium + Ruffle. Ruffle is a test-only
// dependency under _build/visuals/package; nothing is added to the mod runtime.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const build = path.join(root, '_build/visuals');
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#7895a3}ruffle-player{width:1024px;height:768px}</style>
<script>window.RufflePlayer={config:{autoplay:'on',unmuteOverlay:'hidden',warnOnUnsupportedContent:false,logLevel:'info',backgroundColor:'#7895a3'}};</script>
<script src="/package/ruffle.js"></script><div id="player"></div><script>
window.addEventListener('load',async()=>{const p=window.RufflePlayer.newest().createPlayer();document.querySelector('#player').appendChild(p);await p.ruffle().load({url:'/visual_test_host.swf'});window.ready=true;});</script>`;
const logs = [];
(async () => {
    const server = http.createServer((req,res) => {
        if (req.url.startsWith('/?') || req.url === '/') {
            const mode = new URL(req.url,'http://localhost').searchParams.get('mode') || 'normal';
            const swf = mode === 'waiting' ? 'FPVDroneOverlay.swf' : 'visual_test_'+mode+'.swf';
            res.setHeader('Content-Type','text/html'); res.end(html.replace('visual_test_host.swf',swf)); return;
        }
        if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
        const target = path.resolve(build,'.'+decodeURIComponent(req.url.split('?')[0]));
        if (!target.startsWith(build+path.sep) || !fs.existsSync(target)) {res.writeHead(404);res.end();return;}
        const mime={'.js':'application/javascript','.wasm':'application/wasm','.swf':'application/x-shockwave-flash'};
        res.setHeader('Content-Type',mime[path.extname(target)] || 'application/octet-stream');
        res.end(fs.readFileSync(target));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try {
        browser = await chromium.launch({headless:true,channel:'chrome',args:['--disable-gpu']});
        const page = await browser.newPage({viewport:{width:1024,height:768},deviceScaleFactor:1});
        page.on('console',msg=>logs.push(`${msg.type()}: ${msg.text()}`));
        page.on('pageerror',error=>logs.push('PAGEERROR: '+error.message));
        for (const mode of ['normal','hidden','lost','scaled','waiting']) {
            await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
            await page.waitForFunction(()=>window.ready===true,{timeout:30000});
            await page.waitForTimeout(850);
            await page.screenshot({path:path.join(build,`ruffle_${mode}.png`)});
            if(mode==='normal') {
                await page.waitForTimeout(115);
                await page.screenshot({path:path.join(build,'ruffle_normal_2.png')});
            }
        }
        fs.writeFileSync(path.join(build,'ruffle.log'),logs.join('\n'));
        const errors=logs.filter(line=>/VerifyError|ReferenceError|TypeError|PAGEERROR|panicked|AVM2 error/.test(line));
        console.log(JSON.stringify({errors,logLines:logs.length,modes:['normal','hidden','lost','scaled','waiting']},null,2));
        if (errors.length) process.exitCode=1;
    } finally { if(browser) await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
