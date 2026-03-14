document.addEventListener('DOMContentLoaded', () => {
    
    // Elements
    const typeToggleBtns = document.querySelectorAll('.segmented-btn');
    const resinSpecificDiv = document.getElementById('resin-specific');
    const outConsumablesLabel = document.getElementById('out-consumables-label');
    
    // Inputs
    const inputs = {
        printerPrice: document.getElementById('printer-price'),
        printHours: document.getElementById('print-hours'),
        matPrice: document.getElementById('material-price'),
        powerRate: document.getElementById('electricity-rate'),
        ipaCost: document.getElementById('ipa-cost'),
        fepCost: document.getElementById('fep-cost')
    };

    let currentType = 'FDM';

    // Type Toggle Logic (Segmented Control)
    const primaryCta = document.getElementById('primary-cta-link');
    const materialLabel = document.getElementById('out-material-label');
    const inputMaterialLabel = document.getElementById('material-price-label');

    typeToggleBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active state (Visual & ARIA)
            typeToggleBtns.forEach(b => {
                b.setAttribute('aria-pressed', 'false');
                b.setAttribute('aria-checked', 'false');
            });
            e.target.setAttribute('aria-pressed', 'true');
            e.target.setAttribute('aria-checked', 'true');
            
            // Switch current type
            currentType = e.target.dataset.type;
            
            // UI Adjustments based on Type
            if (currentType === 'Resin') {
                resinSpecificDiv.style.display = 'block';
                outConsumablesLabel.textContent = "FEP, Screens & Wash";
                materialLabel.textContent = "Material (Resin) - 1 Year";
                inputMaterialLabel.textContent = "Material Price (per Liter) ($)";
                inputs.matPrice.value = 30; // Default Resin assumption
                primaryCta.textContent = "Find a Resin Printer";
                primaryCta.href = "/best.html?type=resin-detail";
            } else {
                resinSpecificDiv.style.display = 'none';
                outConsumablesLabel.textContent = "Nozzles, Belts & PEI";
                materialLabel.textContent = "Material (Filament) - 1 Year";
                inputMaterialLabel.textContent = "Material Price (per kg) ($)";
                inputs.matPrice.value = 20; // Default PLA assumption
                primaryCta.textContent = "Find an FDM Printer";
                primaryCta.href = "/best.html?type=beginners";
            }
            
            calculate();
        });
    });

    // Add listeners to all inputs to recalc on change
    Object.values(inputs).forEach(input => {
        input.addEventListener('input', calculate);
    });

    // Format currency
    const formatCurr = (num) => '$' + num.toFixed(2);

    function calculate() {
        // Collect Vals
        const printer = parseFloat(inputs.printerPrice.value) || 0;
        const hrsPerWeek = parseFloat(inputs.printHours.value) || 0;
        const matPerKgL = parseFloat(inputs.matPrice.value) || 0;
        const powerRate = parseFloat(inputs.powerRate.value) || 0;
        
        // 1 Year Math (52 weeks)
        const hrsPerYear = hrsPerWeek * 52;
        
        // --- MATERIAL CONSUMPTION ASSUMPTION ---
        // Typical FDM prints ~15-25 grams per hour. Let's assume 20g (0.02kg) / hr
        // Typical Resin uses roughly the same in ML volume per hour depending on scale. Let's assume 25ml (0.025L) / hr
        const materialUsageRate = currentType === 'FDM' ? 0.02 : 0.025; 
        const totalMaterialUnitsYearly = hrsPerYear * materialUsageRate;
        const materialCost = totalMaterialUnitsYearly * matPerKgL;
        
        // --- POWER ASSUMPTION ---
        // Typical enclosed coreXY FDM uses ~150-250W. Old bedslingers ~100W. (Average 150W = 0.15kW)
        // Resin printers use very little power ( mostly LCD and LED bed), usually ~40W = 0.04kW
        const kW = currentType === 'FDM' ? 0.15 : 0.04;
        const powerCost = hrsPerYear * kW * powerRate;
        
        // --- CONSUMABLES ASSUMPTION ---
        let consumablesCost = 0;
        if (currentType === 'Resin') {
            const ipa = parseFloat(inputs.ipaCost.value) || 0;
            const fep = parseFloat(inputs.fepCost.value) || 0;
            consumablesCost = (ipa * 12) + fep; // 12 months IPA + yearly FEP/Screens
        } else {
            // Assume 10% of printer cost for random upgrades, nozzles, PEI sheets per year
            consumablesCost = 30 + (printer * 0.05); 
        }

        // --- TOTAL ---
        const total = printer + materialCost + powerCost + consumablesCost;

        // Render Outputs
        document.getElementById('out-printer').textContent = formatCurr(printer);
        document.getElementById('out-material').textContent = formatCurr(materialCost);
        document.getElementById('out-power').textContent = formatCurr(powerCost);
        document.getElementById('out-consumables').textContent = formatCurr(consumablesCost);
        
        document.getElementById('out-total').textContent = formatCurr(total);
        document.getElementById('total-cost').textContent = formatCurr(total);
    }

    // Initial Calc
    calculate();
});
