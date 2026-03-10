document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const browseBtn = document.getElementById('browseBtn');
    const imagePreview = document.getElementById('imagePreview');
    const loading = document.getElementById('loading');
    const resultsSection = document.getElementById('resultsSection');
    
    // UI Elements for Data
    const authenticityCard = document.getElementById('authenticityCard');
    const statusIcon = document.getElementById('statusIcon');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    
    const cameraInfoList = document.getElementById('cameraInfoList');
    const timingInfoList = document.getElementById('timingInfoList');
    const softwareInfoList = document.getElementById('softwareInfoList');
    const gpsSection = document.getElementById('gpsSection');
    const gpsInfoList = document.getElementById('gpsInfoList');

    // Drag & Drop Flow
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    uploadZone.addEventListener('click', (e) => {
        if(e.target !== browseBtn) {
            fileInput.click();
        }
    });

    browseBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file.');
            return;
        }

        // Preview
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.add('active');
        };
        reader.readAsDataURL(file);

        // Reset UI
        resultsSection.classList.add('hidden');
        loading.classList.remove('hidden');

        // Parse EXIF
        setTimeout(() => {
            parseExif(file);
        }, 500); // slight delay for animation effect
    }

    async function parseExif(file) {
        try {
            // Read full EXIF using exifr
            const exifData = await exifr.parse(file, true);
            const gpsData = await exifr.gps(file);
            
            analyzeAndLogMetadata(exifData, gpsData);
        } catch (error) {
            console.error('Error parsing EXIF:', error);
            analyzeAndLogMetadata(null, null); // Likely stripped or invalid
        }
    }

    function createListItem(label, value) {
        if (value === undefined || value === null || value === '') {
            return `<li class="data-item"><span class="data-label">${label}</span><span class="data-val val-missing">Not Available</span></li>`;
        }
        return `<li class="data-item"><span class="data-label">${label}</span><span class="data-val">${value}</span></li>`;
    }

    function analyzeAndLogMetadata(data, gps) {
        loading.classList.add('hidden');
        
        let riskScore = 0; // 0 = Clean, 1 = Suspicious, 2 = Likely Manipulated/Stripped
        let statusReasons = [];

        // Clear previous lists
        cameraInfoList.innerHTML = '';
        timingInfoList.innerHTML = '';
        softwareInfoList.innerHTML = '';
        gpsInfoList.innerHTML = '';
        gpsSection.classList.add('hidden');

        if (!data) {
            riskScore = 2;
            statusReasons.push('Absolute absence of EXIF metadata. Image has likely been processed, exported by software, or downloaded from a platform that strips metadata.');
            
            renderEmptyState();
        } else {
            // Camera Make / Model checks
            cameraInfoList.innerHTML += createListItem('Make', data.Make);
            cameraInfoList.innerHTML += createListItem('Model', data.Model);
            cameraInfoList.innerHTML += createListItem('Lens', data.LensModel || data.Lens);
            cameraInfoList.innerHTML += createListItem('Aperture', data.FNumber ? `f/${data.FNumber}` : null);
            cameraInfoList.innerHTML += createListItem('Exposure Time', data.ExposureTime ? `${data.ExposureTime}s` : null);
            cameraInfoList.innerHTML += createListItem('ISO', data.ISO);

            if (!data.Make && !data.Model) {
                riskScore = Math.max(riskScore, 1);
                statusReasons.push('Missing camera Make/Model information.');
            }

            // Software Checks
            softwareInfoList.innerHTML += createListItem('Software', data.Software);
            softwareInfoList.innerHTML += createListItem('Color Space', data.ColorSpace === 1 ? 'sRGB' : (data.ColorSpace === 65535 ? 'Uncalibrated' : data.ColorSpace));
            
            if (data.Software) {
                const softwareLower = data.Software.toLowerCase();
                const suspiciousTools = ['adobe', 'photoshop', 'lightroom', 'gimp', 'canva', 'pixelmator', 'snapseed'];
                if (suspiciousTools.some(tool => softwareLower.includes(tool))) {
                    riskScore = 2;
                    statusReasons.push(`Image edited with post-processing software (${data.Software}).`);
                }
            }

            // Timing Checks
            const dateOriginal = data.DateTimeOriginal ? new Date(data.DateTimeOriginal) : null;
            const dateModified = data.ModifyDate ? new Date(data.ModifyDate) : null;
            
            timingInfoList.innerHTML += createListItem('Captured', dateOriginal ? dateOriginal.toLocaleString() : null);
            timingInfoList.innerHTML += createListItem('Modified/Exported', dateModified ? dateModified.toLocaleString() : null);

            if(dateOriginal && dateModified) {
                const diffTime = Math.abs(dateModified - dateOriginal);
                if (diffTime > 60000) { // More than a minute difference
                    riskScore = Math.max(riskScore, 1);
                    statusReasons.push('Modified date significantly differs from Original capture date.');
                }
            } else if (!dateOriginal && dateModified) {
                riskScore = Math.max(riskScore, 1);
                statusReasons.push('Missing original capture time, but has modified time.');
            } else if (!dateOriginal && !dateModified) {
                riskScore = Math.max(riskScore, 1);
                statusReasons.push('All timestamp metadata is missing.');
            }

            // GPS Data
            if (gps && gps.latitude && gps.longitude) {
                gpsSection.classList.remove('hidden');
                gpsInfoList.innerHTML += createListItem('Latitude', gps.latitude.toFixed(6));
                gpsInfoList.innerHTML += createListItem('Longitude', gps.longitude.toFixed(6));
                // Add a Maps link
                const mapLink = `<a href="https://www.google.com/maps/search/?api=1&query=${gps.latitude},${gps.longitude}" target="_blank" style="color:#a855f7;text-decoration:none;font-weight:600;">View on Google Maps ↗</a>`;
                gpsInfoList.innerHTML += `<li class="data-item mt-2">${mapLink}</li>`;
            } else {
               // Only flag GPS missing if it's a smartphone image typically (hard to deduce purely, so we just ignore GPS absence as a risk factor generally)
            }
        }

        renderStatus(riskScore, statusReasons);
        resultsSection.classList.remove('hidden');
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderEmptyState() {
        cameraInfoList.innerHTML = createListItem('Metadata', null);
        timingInfoList.innerHTML = createListItem('Timestamps', null);
        softwareInfoList.innerHTML = createListItem('Processing', null);
    }

    function renderStatus(score, reasons) {
        authenticityCard.className = 'authenticity-card glass-card'; // reset
        
        const svgCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
        const svgAlert = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
        
        if (score === 0) {
            authenticityCard.classList.add('risk-low');
            statusIcon.innerHTML = svgCheck;
            statusTitle.textContent = 'Authentic Format Detected';
            statusMessage.textContent = 'Metadata appears consistent with a raw or direct camera output. No obvious signs of manipulation software detected.';
        } else if (score === 1) {
            authenticityCard.classList.add('risk-medium');
            statusIcon.innerHTML = svgAlert;
            statusTitle.textContent = 'Suspicious Indicators Found';
            
            let html = `Some metadata anomalies were detected:<ul style="margin-top: 0.5rem; margin-left: 1.5rem; font-size: 0.9rem; color: var(--text-secondary);">`;
            reasons.forEach(r => html += `<li>${r}</li>`);
            html += `</ul>`;
            statusMessage.innerHTML = html;
        } else {
            authenticityCard.classList.add('risk-high');
            statusIcon.innerHTML = svgAlert;
            statusTitle.textContent = 'High Risk of Manipulation / Stripping';
            
            let html = `Strong indicators that the image was modified or metadata was intentionally stripped:<ul style="margin-top: 0.5rem; margin-left: 1.5rem; font-size: 0.9rem; color: var(--text-secondary);">`;
            reasons.forEach(r => html += `<li>${r}</li>`);
            html += `</ul>`;
            statusMessage.innerHTML = html;
        }
    }
});
