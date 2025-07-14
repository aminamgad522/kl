class ETAInvoiceExporter {
  constructor() {
    this.invoiceData = [];
    this.totalCount = 0;
    this.currentPage = 1;
    this.totalPages = 1;
    this.isProcessing = false;
    
    this.initializeElements();
    this.attachEventListeners();
    this.checkCurrentPage();
    this.setupProgressListener();
    this.addPerformanceModeSelector();
  }
  
  initializeElements() {
    this.elements = {
      countInfo: document.getElementById('countInfo'),
      totalCountText: document.getElementById('totalCountText'),
      status: document.getElementById('status'),
      closeBtn: document.getElementById('closeBtn'),
      jsonBtn: document.getElementById('jsonBtn'),
      excelBtn: document.getElementById('excelBtn'),
      pdfBtn: document.getElementById('pdfBtn'),
      progressContainer: null,
      progressBar: null,
      progressText: null,
      checkboxes: {
        serialNumber: document.getElementById('option-serial-number'),
        detailsButton: document.getElementById('option-details-button'),
        documentType: document.getElementById('option-document-type'),
        documentVersion: document.getElementById('option-document-version'),
        status: document.getElementById('option-status'),
        issueDate: document.getElementById('option-issue-date'),
        submissionDate: document.getElementById('option-submission-date'),
        invoiceCurrency: document.getElementById('option-invoice-currency'),
        invoiceValue: document.getElementById('option-invoice-value'),
        vatAmount: document.getElementById('option-vat-amount'),
        taxDiscount: document.getElementById('option-tax-discount'),
        totalInvoice: document.getElementById('option-total-invoice'),
        internalNumber: document.getElementById('option-internal-number'),
        electronicNumber: document.getElementById('option-electronic-number'),
        sellerTaxNumber: document.getElementById('option-seller-tax-number'),
        sellerName: document.getElementById('option-seller-name'),
        sellerAddress: document.getElementById('option-seller-address'),
        buyerTaxNumber: document.getElementById('option-buyer-tax-number'),
        buyerName: document.getElementById('option-buyer-name'),
        buyerAddress: document.getElementById('option-buyer-address'),
        purchaseOrderRef: document.getElementById('option-purchase-order-ref'),
        purchaseOrderDesc: document.getElementById('option-purchase-order-desc'),
        salesOrderRef: document.getElementById('option-sales-order-ref'),
        electronicSignature: document.getElementById('option-electronic-signature'),
        foodDrugGuide: document.getElementById('option-food-drug-guide'),
        externalLink: document.getElementById('option-external-link'),
        downloadDetails: document.getElementById('option-download-details'),
        combineAll: document.getElementById('option-combine-all'),
        downloadAll: document.getElementById('option-download-all'),
        selectAll: document.getElementById('option-select-all')
      }
    };
    
    this.createProgressElements();
  }
  
  addPerformanceModeSelector() {
    const performanceSection = document.createElement('div');
    performanceSection.className = 'section';
    performanceSection.innerHTML = `
      <div class="section-title">وضع الأداء (جديد):</div>
      <div class="checkbox-group">
        <div class="checkbox-item">
          <input type="radio" id="mode-auto" name="performance-mode" value="auto" checked>
          <label for="mode-auto">تلقائي - سريع وآمن (موصى به)</label>
        </div>
        <div class="checkbox-item">
          <input type="radio" id="mode-fast" name="performance-mode" value="fast">
          <label for="mode-fast">سريع جداً - قد يفشل أحياناً</label>
        </div>
        <div class="checkbox-item">
          <input type="radio" id="mode-safe" name="performance-mode" value="safe">
          <label for="mode-safe">آمن - بطيء (الطريقة القديمة)</label>
        </div>
      </div>
    `;
    
    // Insert before the first section
    const firstSection = document.querySelector('.section');
    firstSection.parentNode.insertBefore(performanceSection, firstSection);
    
    // Add event listeners
    document.querySelectorAll('input[name="performance-mode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.setPerformanceMode(e.target.value);
        }
      });
    });
  }
  
  async setPerformanceMode(mode) {
    try {
      await chrome.runtime.sendMessage({
        action: 'optimizePerformance',
        mode: mode
      });
      
      const modeNames = {
        'auto': 'تلقائي',
        'fast': 'سريع جداً',
        'safe': 'آمن'
      };
      
      this.showStatus(`تم تعيين وضع الأداء إلى: ${modeNames[mode]}`, 'success');
    } catch (error) {
      console.error('Failed to set performance mode:', error);
    }
  }
  
  createProgressElements() {
    this.elements.progressContainer = document.createElement('div');
    this.elements.progressContainer.className = 'progress-container';
    this.elements.progressContainer.style.cssText = `
      margin-top: 15px;
      padding: 15px;
      background: #f8f9fa;
      border-radius: 8px;
      border: 1px solid #e9ecef;
      display: none;
    `;
    
    this.elements.progressBar = document.createElement('div');
    this.elements.progressBar.className = 'progress-bar';
    this.elements.progressBar.style.cssText = `
      width: 100%;
      height: 20px;
      background: #e9ecef;
      border-radius: 10px;
      overflow: hidden;
      margin-bottom: 10px;
      position: relative;
    `;
    
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.cssText = `
      height: 100%;
      background: linear-gradient(90deg, #28a745, #20c997);
      border-radius: 10px;
      width: 0%;
      transition: width 0.3s ease;
      position: relative;
    `;
    
    this.elements.progressBar.appendChild(progressFill);
    
    this.elements.progressText = document.createElement('div');
    this.elements.progressText.className = 'progress-text';
    this.elements.progressText.style.cssText = `
      text-align: center;
      font-size: 14px;
      color: #495057;
      font-weight: 500;
    `;
    
    this.elements.progressContainer.appendChild(this.elements.progressBar);
    this.elements.progressContainer.appendChild(this.elements.progressText);
    
    const statusElement = this.elements.status;
    statusElement.parentNode.insertBefore(this.elements.progressContainer, statusElement.nextSibling);
  }
  
  attachEventListeners() {
    this.elements.closeBtn.addEventListener('click', () => window.close());
    this.elements.excelBtn.addEventListener('click', () => this.handleExport('excel'));
    this.elements.jsonBtn.addEventListener('click', () => this.handleExport('json'));
    this.elements.pdfBtn.addEventListener('click', () => this.handleExport('pdf'));
    
    if (this.elements.checkboxes.downloadAll) {
      this.elements.checkboxes.downloadAll.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.showMultiPageWarning();
        }
      });
    }

    if (this.elements.checkboxes.selectAll) {
      this.elements.checkboxes.selectAll.addEventListener('change', (e) => {
        this.toggleAllCheckboxes(e.target.checked);
      });
    }
  }

  toggleAllCheckboxes(checked) {
    const fieldCheckboxes = [
      'serialNumber', 'detailsButton', 'documentType', 'documentVersion', 'status',
      'issueDate', 'submissionDate', 'invoiceCurrency', 'invoiceValue', 'vatAmount',
      'taxDiscount', 'totalInvoice', 'internalNumber', 'electronicNumber',
      'sellerTaxNumber', 'sellerName', 'sellerAddress', 'buyerTaxNumber',
      'buyerName', 'buyerAddress', 'purchaseOrderRef', 'purchaseOrderDesc',
      'salesOrderRef', 'electronicSignature', 'foodDrugGuide', 'externalLink'
    ];

    fieldCheckboxes.forEach(field => {
      const checkbox = this.elements.checkboxes[field];
      if (checkbox) {
        checkbox.checked = checked;
      }
    });
  }
  
  setupProgressListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'progressUpdate') {
        this.updateProgress(message.progress);
      }
    });
  }
  
  showMultiPageWarning() {
    const warningText = `⚡ النظام المحسن: سيتم تحميل جميع الصفحات (${this.totalPages} صفحة) بسرعة وكفاءة عالية!`;
    this.showStatus(warningText, 'loading');
    
    setTimeout(() => {
      this.elements.status.textContent = '';
      this.elements.status.className = 'status';
    }, 4000);
  }
  
  async checkCurrentPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('invoicing.eta.gov.eg')) {
        this.showStatus('يرجى الانتقال إلى بوابة الفواتير الإلكترونية المصرية', 'error');
        this.disableButtons();
        return;
      }
      
      // Show loading status
      this.showStatus('جاري تحميل المكونات المطلوبة...', 'loading');
      
      await this.ensureContentScriptLoaded(tab.id);
      await this.loadInvoiceData();
    } catch (error) {
      this.showStatus('خطأ في فحص الصفحة الحالية: ' + error.message, 'error');
      console.error('Error:', error);
      this.disableButtons();
    }
  }
  
  async ensureContentScriptLoaded(tabId) {
    try {
      // First try to ping the existing content script
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log('Content script already loaded and responsive');
    } catch (error) {
      console.log('Content script not found, injecting...');
      
      try {
        // Inject CSS first
        await chrome.scripting.insertCSS({
          target: { tabId: tabId },
          files: ['content.css']
        });
        
        // Then inject the content script
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['content.js']
        });
        
        // Wait for content script to initialize
        await this.waitForContentScript(tabId);
        console.log('Content script successfully injected and ready');
      } catch (injectError) {
        console.error('Injection failed:', injectError);
        throw new Error('فشل في تحميل المكونات المطلوبة. يرجى إعادة تحميل الصفحة والمحاولة مرة أخرى.');
      }
    }
  }
  
  async waitForContentScript(tabId, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        if (response && response.success) {
          return true;
        }
      } catch (error) {
        console.log(`Ping attempt ${i + 1} failed, retrying...`);
      }
    }
    throw new Error('Content script failed to respond after injection');
  }
  
  async loadInvoiceData() {
    try {
      this.showStatus('جاري تحميل بيانات الفواتير بالنظام المحسن...', 'loading');
      
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await this.sendMessageWithRetry(tab.id, { action: 'getInvoiceData' });
      
      if (!response || !response.success) {
        throw new Error('فشل في الحصول على بيانات الفواتير. يرجى التأكد من وجود فواتير في الصفحة الحالية.');
      }
      
      this.invoiceData = response.data.invoices || [];
      this.totalCount = response.data.totalCount || this.invoiceData.length;
      this.currentPage = response.data.currentPage || 1;
      this.totalPages = response.data.totalPages || 1;
      
      // Validate data
      if (this.invoiceData.length === 0) {
        throw new Error('لم يتم العثور على فواتير في الصفحة الحالية. يرجى التأكد من تحميل الصفحة بالكامل.');
      }
      
      if (this.totalCount === 0) {
        this.totalCount = this.invoiceData.length;
      }
      
      if (this.totalPages === 0) {
        this.totalPages = 1;
      }
      
      this.updateUI();
      this.showStatus(`✅ تم تحميل ${this.invoiceData.length} فاتورة بنجاح - النظام المحسن جاهز للتصدير!`, 'success');
      
    } catch (error) {
      this.showStatus('خطأ في تحميل البيانات: ' + error.message, 'error');
      console.error('Load error:', error);
      
      // Show fallback UI even on error
      this.elements.countInfo.innerHTML = `
        <div style="color: #c62828;">خطأ في تحميل البيانات - يرجى إعادة تحميل الصفحة</div>
      `;
    }
  }
  
  async sendMessageWithRetry(tabId, message, maxRetries = 3) {
    let lastError = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Sending message attempt ${i + 1}:`, message.action);
        
        // Create a promise that resolves/rejects based on the response
        const response = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response) {
              resolve(response);
            } else {
              reject(new Error('No response received'));
            }
          });
        });
        
        if (response && response.success !== false) {
          console.log(`Message successful on attempt ${i + 1}`);
          return response;
        }
        
        throw new Error(response.error || 'Unknown error from content script');
        
      } catch (error) {
        console.log(`Message attempt ${i + 1} failed:`, error.message);
        lastError = error;
        
        if (i === maxRetries - 1) {
          break; // Exit retry loop on last attempt
        }
        
        // Re-inject content script on connection errors
        if (error.message.includes('Could not establish connection') || 
            error.message.includes('message channel closed')) {
          try {
            console.log('Re-injecting content script...');
            await this.ensureContentScriptLoaded(tabId);
          } catch (injectError) {
            console.error('Failed to re-inject content script:', injectError);
          }
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
      }
    }
    
    // If we get here, all retries failed
    if (lastError && lastError.message.includes('Could not establish connection')) {
      throw new Error('فشل في الاتصال مع الصفحة. يرجى إعادة تحميل الصفحة وإعادة فتح الإضافة.');
    }
    
    throw lastError || new Error('فشل في إرسال الرسالة بعد عدة محاولات');
  }
  
  updateUI() {
    const currentPageCount = this.invoiceData.length;
    
    // Update main count info
    this.elements.countInfo.innerHTML = `
      <div>تم العثور على البيانات بنجاح - النظام المحسن جاهز للتصدير</div>
    `;
    
    // Update detailed count information
    const countDetails = document.getElementById('countDetails');
    if (countDetails) {
      countDetails.style.display = 'grid';
      
      document.getElementById('currentPageCount').textContent = currentPageCount;
      document.getElementById('totalInvoicesCount').textContent = this.totalCount;
      document.getElementById('currentPageNumber').textContent = this.currentPage;
      document.getElementById('totalPagesCount').textContent = this.totalPages;
    }
    
    if (this.elements.totalCountText) {
      this.elements.totalCountText.textContent = this.totalCount;
    }
    
    if (document.getElementById('totalPagesText')) {
      document.getElementById('totalPagesText').textContent = this.totalPages;
    }
    
    const downloadAllLabel = this.elements.checkboxes.downloadAll?.parentElement.querySelector('label');
    if (downloadAllLabel) {
      downloadAllLabel.innerHTML = `⚡ تحميل جميع الصفحات بسرعة محسنة - <span id="totalCountText">${this.totalCount}</span> فاتورة (<span id="totalPagesText">${this.totalPages}</span> صفحة)`;
    }
  }
  
  getSelectedOptions() {
    const options = {};
    Object.keys(this.elements.checkboxes).forEach(key => {
      const checkbox = this.elements.checkboxes[key];
      if (checkbox) {
        options[key] = checkbox.checked;
      } else {
        options[key] = false;
      }
    });
    return options;
  }
  
  async handleExport(format) {
    if (this.isProcessing) {
      this.showStatus('جاري المعالجة... يرجى الانتظار', 'loading');
      return;
    }
    
    const options = this.getSelectedOptions();
    
    if (!this.validateOptions(options)) {
      return;
    }
    
    this.isProcessing = true;
    this.disableButtons();
    
    try {
      if (options.downloadAll) {
        await this.exportAllPages(format, options);
      } else {
        await this.exportCurrentPage(format, options);
      }
    } catch (error) {
      this.showStatus('خطأ في التصدير: ' + error.message, 'error');
      console.error('Export error:', error);
    } finally {
      this.isProcessing = false;
      this.enableButtons();
      this.hideProgress();
    }
  }
  
  validateOptions(options) {
    const hasBasicField = options.serialNumber || options.electronicNumber || options.internalNumber || 
                         options.totalInvoice || options.invoiceValue || options.documentType;
    if (!hasBasicField) {
      this.showStatus('يرجى اختيار حقل واحد على الأقل للتصدير', 'error');
      return false;
    }
    return true;
  }
  
  async exportCurrentPage(format, options) {
    this.showStatus('جاري تصدير الصفحة الحالية...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    let dataToExport = [...this.invoiceData];
    
    if (options.downloadDetails) {
      this.showStatus('جاري تحميل تفاصيل الفواتير...', 'loading');
      dataToExport = await this.loadInvoiceDetails(dataToExport, tab.id);
    }
    
    await this.generateFile(dataToExport, format, options);
    this.showStatus(`✅ تم تصدير ${dataToExport.length} فاتورة بنجاح!`, 'success');
  }
  
  async exportAllPages(format, options) {
    this.showProgress();
    this.showStatus('⚡ جاري التحميل المحسن لجميع الصفحات...', 'loading');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const allData = await this.sendMessageWithRetry(tab.id, { 
      action: 'getAllPagesData',
      options: { ...options, progressCallback: true }
    });
    
    if (!allData || !allData.success) {
      throw new Error('فشل في تحميل جميع الصفحات بالنظام المحسن: ' + (allData?.error || 'خطأ غير معروف'));
    }
    
    let dataToExport = allData.data;
    
    // Validate loaded data
    if (!dataToExport || dataToExport.length === 0) {
      throw new Error('لم يتم تحميل أي بيانات من الصفحات. يرجى التأكد من وجود فواتير والمحاولة مرة أخرى.');
    }
    
    if (options.downloadDetails && dataToExport.length > 0) {
      this.updateProgress({
        currentPage: this.totalPages,
        totalPages: this.totalPages,
        message: 'جاري تحميل تفاصيل جميع الفواتير بالنظام المحسن...'
      });
      
      dataToExport = await this.loadInvoiceDetails(dataToExport, tab.id);
    }
    
    this.updateProgress({
      currentPage: this.totalPages,
      totalPages: this.totalPages,
      message: 'جاري إنشاء الملف بالتنسيق المطلوب...'
    });
    
    await this.generateFile(dataToExport, format, options);
    this.showStatus(`🚀 تم تصدير ${dataToExport.length} فاتورة من جميع الصفحات بالنظام المحسن بنجاح!`, 'success');
  }
  
  showProgress() {
    this.elements.progressContainer.style.display = 'block';
    this.updateProgress({ currentPage: 0, totalPages: this.totalPages, message: 'جاري البدء...' });
  }
  
  hideProgress() {
    this.elements.progressContainer.style.display = 'none';
  }
  
  updateProgress(progress) {
    if (!this.elements.progressContainer || this.elements.progressContainer.style.display === 'none') {
      return;
    }
    
    const percentage = progress.percentage || (progress.totalPages > 0 ? (progress.currentPage / progress.totalPages) * 100 : 0);
    
    const progressFill = this.elements.progressBar.querySelector('.progress-fill');
    if (progressFill) {
      progressFill.style.width = `${Math.min(percentage, 100)}%`;
    }
    
    if (this.elements.progressText) {
      this.elements.progressText.textContent = progress.message || `تم تحميل ${progress.currentPage} من ${progress.totalPages} صفحة (${Math.round(percentage)}%)`;
    }
  }
  
  async loadInvoiceDetails(invoices, tabId) {
    const detailedInvoices = [];
    const batchSize = 5; // Increased batch size for faster processing
    
    for (let i = 0; i < invoices.length; i += batchSize) {
      const batch = invoices.slice(i, i + batchSize);
      const batchPromises = batch.map(async (invoice, batchIndex) => {
        const globalIndex = i + batchIndex;
        this.showStatus(`جاري تحميل تفاصيل الفاتورة ${globalIndex + 1} من ${invoices.length}...`, 'loading');
        
        try {
          const detailResponse = await this.sendMessageWithRetry(tabId, {
            action: 'getInvoiceDetails',
            invoiceId: invoice.electronicNumber
          });
          
          if (detailResponse && detailResponse.success) {
            return {
              ...invoice,
              details: detailResponse.data
            };
          } else {
            return invoice;
          }
        } catch (error) {
          console.warn(`Failed to load details for invoice ${invoice.electronicNumber}:`, error);
          return invoice;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      detailedInvoices.push(...batchResults);
      
      if (i + batchSize < invoices.length) {
        await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay
      }
    }
    
    return detailedInvoices;
  }
  
  async generateFile(data, format, options) {
    switch (format) {
      case 'excel':
        this.generateExcelFileWithCorrectLayout(data, options);
        break;
      case 'json':
        this.generateJSONFile(data, options);
        break;
      case 'pdf':
        this.showStatus('تصدير PDF غير متاح حاليًا', 'error');
        break;
    }
  }
  
  generateExcelFileWithCorrectLayout(data, options) {
    const wb = XLSX.utils.book_new();
    
    this.createMainSheetWithExactLayout(wb, data, options);
    
    if (options.downloadDetails) {
      this.createDetailsSheetsWithLinks(wb, data, options);
    }
    
    this.createStatisticsSheet(wb, data, options);
    
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const pageInfo = options.downloadAll ? 'AllPages_Fast' : `Page${this.currentPage}`;
    const filename = `ETA_Invoices_${pageInfo}_${timestamp}.xlsx`;
    
    XLSX.writeFile(wb, filename);
  }
  
  createMainSheetWithExactLayout(wb, data, options) {
    const headers = [
      'تسلسل',                    
      'عرض',                     
      'نوع المستند',              
      'نسخة المستند',             
      'الحالة',                  
      'تاريخ الإصدار',            
      'تاريخ التقديم',            
      'عملة الفاتورة',            
      'قيمة الفاتورة',            
      'ضريبة القيمة المضافة',      
      'الخصم تحت حساب الضريبة',    
      'إجمالي الفاتورة',          
      'الرقم الداخلي',            
      'الرقم الإلكتروني',         
      'الرقم الضريبي للبائع',      
      'اسم البائع',              
      'عنوان البائع',            
      'الرقم الضريبي للمشتري',     
      'اسم المشتري',             
      'عنوان المشتري',           
      'مرجع طلب الشراء',          
      'وصف طلب الشراء',          
      'مرجع طلب المبيعات',        
      'التوقيع الإلكتروني',       
      'دليل الغذاء والدواء',       
      'الرابط الخارجي'            
    ];

    const rows = [headers];
    
    data.forEach((invoice, index) => {
      const row = [
        index + 1,                                           
        'عرض',                                               
        invoice.documentType || 'فاتورة',                    
        invoice.documentVersion || '1.0',                    
        invoice.status || '',                                
        invoice.issueDate || '',                             
        invoice.submissionDate || invoice.issueDate || '',   
        invoice.invoiceCurrency || 'EGP',                    
        this.formatCurrency(invoice.invoiceValue || invoice.totalAmount), 
        this.formatCurrency(invoice.vatAmount),              
        this.formatCurrency(invoice.taxDiscount || '0'),     
        this.formatCurrency(invoice.totalAmount),            
        invoice.internalNumber || '',                        
        invoice.electronicNumber || '',                      
        invoice.sellerTaxNumber || '',                       
        invoice.sellerName || '',                            
        invoice.sellerAddress || '',                         
        invoice.buyerTaxNumber || '',                        
        invoice.buyerName || '',                             
        invoice.buyerAddress || '',                          
        invoice.purchaseOrderRef || '',                      
        invoice.purchaseOrderDesc || '',                     
        invoice.salesOrderRef || '',                         
        invoice.electronicSignature || 'موقع إلكترونياً',    
        invoice.foodDrugGuide || '',                         
        invoice.externalLink || ''                           
      ];
      
      rows.push(row);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(rows);
    
    this.addInternalHyperlinks(ws, data);
    this.formatMainWorksheet(ws, headers, data.length);
    
    XLSX.utils.book_append_sheet(wb, ws, 'فواتير مصلحة الضرائب');
  }
  
  addInternalHyperlinks(ws, data) {
    data.forEach((invoice, index) => {
      const rowIndex = index + 2;
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex - 1, c: 1 });
      
      if (ws[cellAddress] && invoice.electronicNumber) {
        const sheetName = `تفاصيل_${index + 1}`;
        
        ws[cellAddress].l = { 
          Target: `#'${sheetName}'!A1`, 
          Tooltip: `عرض تفاصيل الفاتورة ${invoice.internalNumber || index + 1}` 
        };
        
        ws[cellAddress].s = {
          font: { 
            color: { rgb: "0000FF" }, 
            underline: true,
            bold: true
          },
          alignment: { horizontal: "center", vertical: "center" }
        };
      }
    });
  }
  
  createDetailsSheetsWithLinks(wb, data, options) {
    data.forEach((invoice, index) => {
      const sheetName = `تفاصيل_${index + 1}`;
      
      const detailHeaders = [
        'كود الصنف',                
        'الوصف',                   
        'كود الوحدة',              
        'اسم الوحدة',              
        'الكمية',                 
        'السعر',                  
        'القيمة',                 
        'الضريبة',                
        'ضريبة القيمة المضافة',    
        'الإجمالي'                
      ];
      
      const detailRows = [
        ['معلومات الفاتورة', '', '', '', '', '', '', '', '', ''],
        ['الرقم الإلكتروني:', invoice.electronicNumber || '', '', '', '', '', '', '', '', ''],
        ['الرقم الداخلي:', invoice.internalNumber || '', '', '', '', '', '', '', '', ''],
        ['التاريخ:', invoice.issueDate || '', '', '', '', '', '', '', '', ''],
        ['البائع:', invoice.sellerName || '', '', '', '', '', '', '', '', ''],
        ['المشتري:', invoice.buyerName || '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', ''],
        detailHeaders
      ];
      
      if (invoice.details && invoice.details.length > 0) {
        invoice.details.forEach(item => {
          detailRows.push([
            item.itemCode || '',                              
            item.description || '',                           
            item.unitCode || 'EA',                           
            item.unitName || 'قطعة',                         
            item.quantity || '1',                            
            this.formatCurrency(item.unitPrice),             
            this.formatCurrency(item.totalValue),            
            this.formatCurrency(item.taxAmount || '0'),      
            this.formatCurrency(item.vatAmount),             
            this.formatCurrency(item.totalWithVat || item.totalValue) 
          ]);
        });
      } else {
        detailRows.push([
          invoice.electronicNumber || '',
          'إجمالي قيمة الفاتورة',
          'EA',
          'فاتورة',
          '1',
          this.formatCurrency(invoice.totalAmount),
          this.formatCurrency(invoice.invoiceValue || invoice.totalAmount),
          '0',
          this.formatCurrency(invoice.vatAmount),
          this.formatCurrency(invoice.totalAmount)
        ]);
      }
      
      const totalValue = invoice.invoiceValue || invoice.totalAmount || '0';
      const totalVat = invoice.vatAmount || '0';
      const grandTotal = invoice.totalAmount || '0';
      
      detailRows.push([
        '', '', '', '', 'الإجمالي:', 
        this.formatCurrency(totalValue),
        this.formatCurrency(totalValue),
        '0',
        this.formatCurrency(totalVat),
        this.formatCurrency(grandTotal)
      ]);
      
      detailRows.push(['', '', '', '', '', '', '', '', '', '']);
      detailRows.push(['العودة للقائمة الرئيسية', '', '', '', '', '', '', '', '', '']);
      
      const ws = XLSX.utils.aoa_to_sheet(detailRows);
      
      const backLinkCell = XLSX.utils.encode_cell({ r: detailRows.length - 1, c: 0 });
      if (ws[backLinkCell]) {
        ws[backLinkCell].l = { 
          Target: "#'فواتير مصلحة الضرائب'!A1", 
          Tooltip: 'العودة للقائمة الرئيسية' 
        };
        ws[backLinkCell].s = {
          font: { color: { rgb: "0000FF" }, underline: true, bold: true }
        };
      }
      
      this.formatDetailsWorksheet(ws, detailHeaders);
      
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
  }
  
  formatCurrency(value) {
    if (!value || value === '0' || value === '') return '';
    
    const numValue = parseFloat(value.toString().replace(/[,٬]/g, ''));
    if (isNaN(numValue)) return value;
    
    return numValue.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  }
  
  formatMainWorksheet(ws, headers, dataLength) {
    const colWidths = [
      { wch: 8 },   { wch: 10 },  { wch: 15 },  { wch: 8 },   { wch: 15 },  { wch: 18 },  
      { wch: 18 },  { wch: 12 },  { wch: 15 },  { wch: 18 },  { wch: 20 },  { wch: 15 },  
      { wch: 20 },  { wch: 30 },  { wch: 20 },  { wch: 25 },  { wch: 20 },  { wch: 20 },  
      { wch: 25 },  { wch: 20 },  { wch: 20 },  { wch: 20 },  { wch: 20 },  { wch: 18 },  
      { wch: 18 },  { wch: 50 }   
    ];
    
    ws['!cols'] = colWidths;
    
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      if (!ws[cellAddress]) continue;
      
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" }, size: 12 },
        fill: { fgColor: { rgb: "1F4E79" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }
    
    for (let row = 1; row <= range.e.r; row++) {
      const isEvenRow = row % 2 === 0;
      const fillColor = isEvenRow ? "F8F9FA" : "FFFFFF";
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellAddress]) continue;
        
        if (!ws[cellAddress].s) ws[cellAddress].s = {};
        
        ws[cellAddress].s.fill = { fgColor: { rgb: fillColor } };
        ws[cellAddress].s.alignment = { horizontal: "center", vertical: "center" };
        ws[cellAddress].s.border = {
          top: { style: "thin", color: { rgb: "E0E0E0" } },
          bottom: { style: "thin", color: { rgb: "E0E0E0" } },
          left: { style: "thin", color: { rgb: "E0E0E0" } },
          right: { style: "thin", color: { rgb: "E0E0E0" } }
        };
      }
    }
  }
  
  formatDetailsWorksheet(ws, headers) {
    const colWidths = [
      { wch: 20 }, { wch: 35 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, 
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }  
    ];
    
    ws['!cols'] = colWidths;
    
    const range = XLSX.utils.decode_range(ws['!ref']);
    const headerRow = 7;
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
      if (!ws[cellAddress]) continue;
      
      ws[cellAddress].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "2196F3" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } }
        }
      };
    }
    
    for (let row = 8; row <= range.e.r - 2; row++) {
      const isEvenRow = (row - 8) % 2 === 0;
      const fillColor = isEvenRow ? "F8F9FA" : "FFFFFF";
      
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (!ws[cellAddress]) continue;
        
        if (!ws[cellAddress].s) ws[cellAddress].s = {};
        
        ws[cellAddress].s.fill = { fgColor: { rgb: fillColor } };
        ws[cellAddress].s.alignment = { horizontal: "center", vertical: "center" };
        ws[cellAddress].s.border = {
          top: { style: "thin", color: { rgb: "E0E0E0" } },
          bottom: { style: "thin", color: { rgb: "E0E0E0" } },
          left: { style: "thin", color: { rgb: "E0E0E0" } },
          right: { style: "thin", color: { rgb: "E0E0E0" } }
        };
      }
    }
  }
  
  createStatisticsSheet(wb, data, options) {
    const stats = this.calculateStatistics(data);
    
    const statsData = [
      ['إحصائيات الفواتير - التصدير السريع', ''],
      ['', ''],
      ['إجمالي عدد الفواتير', data.length],
      ['إجمالي قيمة الفواتير', this.formatCurrency(stats.totalValue) + ' EGP'],
      ['إجمالي ضريبة القيمة المضافة', this.formatCurrency(stats.totalVAT) + ' EGP'],
      ['متوسط قيمة الفاتورة', this.formatCurrency(stats.averageValue) + ' EGP'],
      ['', ''],
      ['إحصائيات حسب الحالة', ''],
      ...Object.entries(stats.statusCounts).map(([status, count]) => [status, count]),
      ['', ''],
      ['إحصائيات حسب النوع', ''],
      ...Object.entries(stats.typeCounts).map(([type, count]) => [type, count]),
      ['', ''],
      ['تاريخ التصدير', new Date().toLocaleString('ar-EG')],
      ['نوع التصدير', options.downloadAll ? '⚡ جميع الصفحات - سريع' : 'الصفحة الحالية'],
      ['عدد الحقول المصدرة', Object.values(options).filter(Boolean).length],
      ['وضع الأداء', 'محسن للسرعة العالية']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(statsData);
    ws['!cols'] = [{ wch: 30 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, ws, 'الإحصائيات');
  }
  
  calculateStatistics(data) {
    const stats = {
      totalValue: 0,
      totalVAT: 0,
      averageValue: 0,
      statusCounts: {},
      typeCounts: {}
    };
    
    data.forEach(invoice => {
      const value = parseFloat(invoice.totalAmount?.replace(/[,٬]/g, '') || 0);
      const vat = parseFloat(invoice.vatAmount?.replace(/[,٬]/g, '') || 0);
      
      stats.totalValue += value;
      stats.totalVAT += vat;
      
      const status = invoice.status || 'غير محدد';
      stats.statusCounts[status] = (stats.statusCounts[status] || 0) + 1;
      
      const type = invoice.documentType || 'غير محدد';
      stats.typeCounts[type] = (stats.typeCounts[type] || 0) + 1;
    });
    
    stats.averageValue = data.length > 0 ? stats.totalValue / data.length : 0;
    
    return stats;
  }
  
  generateJSONFile(data, options) {
    const jsonData = {
      exportDate: new Date().toISOString(),
      totalCount: data.length,
      exportType: options.downloadAll ? 'all_pages_fast' : 'current_page',
      totalPages: this.totalPages,
      currentPage: this.currentPage,
      selectedFields: Object.keys(options).filter(key => options[key]),
      options: options,
      statistics: this.calculateStatistics(data),
      performanceMode: 'optimized',
      invoices: data
    };
    
    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().split('T')[0];
    const pageInfo = options.downloadAll ? 'AllPages_Fast' : `Page${this.currentPage}`;
    a.download = `ETA_Invoices_${pageInfo}_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  showStatus(message, type = '') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
    
    if (type === 'loading') {
      this.elements.status.innerHTML = `${message} <span class="loading-spinner"></span>`;
    }
    
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        if (!this.isProcessing) {
          this.elements.status.textContent = '';
          this.elements.status.className = 'status';
        }
      }, 3000);
    }
  }
  
  disableButtons() {
    this.elements.excelBtn.disabled = true;
    this.elements.jsonBtn.disabled = true;
    this.elements.pdfBtn.disabled = true;
  }
  
  enableButtons() {
    this.elements.excelBtn.disabled = false;
    this.elements.jsonBtn.disabled = false;
    this.elements.pdfBtn.disabled = false;
  }
}

// Initialize the exporter when popup loads
document.addEventListener('DOMContentLoaded', () => {
  new ETAInvoiceExporter();
});