const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const target = '                        </div>\n                    </a>';
const replacement = `                        </div>
                    </a>
                    <div style="margin-top:0.5rem; margin-left: calc(60px + 1rem); /* align with text */">
                        <label class="compare-checkbox-label" style="display:inline-flex; align-items:center; gap:0.3rem; font-size:0.75rem; color:var(--text-muted); cursor:pointer; font-weight: 500;">
                            <input type="checkbox" onchange="toggleCompare('\${p.id}', '\${escapeHtml(p.product_name).replace(/'/g, \\\\"\\\\'\\\\")}', '\${p.image_url || ''}', \${p.price || 0}, '\${p.amazon_url}')" \${compareList.some(c => c.id === p.id) ? 'checked' : ''}>
                            ➕ Compare
                        </label>
                    </div>`;

// Replace target ignoring \r\n vs \n
code = code.split(/\r?\n/).join('\n');
code = code.replace(target, replacement);

const logic = `
// ============================================
// Compare Tool Logic
// ============================================
function toggleCompare(id, name, image, price, url) {
    const existingIdx = compareList.findIndex(c => c.id === id);
    if (existingIdx >= 0) {
        compareList.splice(existingIdx, 1);
    } else {
        if (compareList.length >= 3) {
            alert('You can only compare up to 3 printers at a time.');
            const cb = document.querySelector(\`input[onchange*="\${id}"]\`);
            if (cb) cb.checked = false;
            return;
        }
        compareList.push({ id, name, image, price, url });
    }
    renderCompareTray();
}

function removeCompare(id) {
    compareList = compareList.filter(c => c.id !== id);
    const cb = document.querySelector(\`input[onchange*="\${id}"]\`);
    if (cb) cb.checked = false;
    renderCompareTray();
}

function renderCompareTray() {
    let tray = document.getElementById('compare-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.id = 'compare-tray';
        tray.className = 'compare-tray';
        document.body.appendChild(tray);
    }

    if (compareList.length === 0) {
        tray.classList.remove('active');
        return;
    }
    tray.classList.add('active');

    tray.innerHTML = \`
        <div class="compare-tray-content">
            <div class="compare-items">
                \${compareList.map(item => \`
                    <div class="compare-item">
                        <img src="\${item.image}" alt="Thumb" onerror="this.style.display='none'">
                        <div class="compare-item-details">
                            <span class="compare-item-name">\${item.name}</span>
                            <span class="compare-item-price">$\${item.price.toFixed(2)}</span>
                        </div>
                        <button class="compare-item-remove" onclick="removeCompare('\${item.id}')">&times;</button>
                    </div>
                \`).join('')}
                \${Array(3 - compareList.length).fill('<div class="compare-placeholder">Add another</div>').join('')}
            </div>
            <div class="compare-actions">
                <button class="btn btn-primary" style="padding: 0.5rem 1rem;" onclick="openCompareModal()" \${compareList.length < 2 ? 'disabled' : ''}>
                    Compare \${compareList.length} Items
                </button>
                <button class="btn btn-outline" style="margin-left:0.5rem; padding: 0.5rem 1rem;" onclick="clearCompare()">Clear</button>
            </div>
        </div>
    \`;
}

function clearCompare() {
    compareList = [];
    document.querySelectorAll('.compare-checkbox').forEach(cb => cb.checked = false);
    renderCompareTray();
}

function openCompareModal() {
    const ids = compareList.map(c => c.id).join(',');
    window.open(\`/compare.html?ids=\${ids}\`, '_blank');
}
`;

if (!code.includes('function openCompareModal')) {
    code += logic;
}

fs.writeFileSync('public/app.js', code);
console.log('Patch complete.');
