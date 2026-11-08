document.addEventListener('DOMContentLoaded', function () {
    const form = document.getElementById('orderForm');
    if (!form) return;

    const fileInput = document.getElementById('pdf_file');
    const dropZone = document.getElementById('dropZone');
    const fileNameDisplay = document.getElementById('file-name');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    const submitBtn = document.getElementById('submitBtn');
    const tempTokenInput = document.getElementById('temp_token');
    const uploadingIndicator = document.getElementById('uploadingIndicator');

    let isUploading = false;
    let uploadedTempToken = null;

    function resetUpload() {
        fileInput.value = '';
        fileNameDisplay.textContent = '';
        uploadedTempToken = null;
        if (tempTokenInput) tempTokenInput.value = '';
        dropZone.classList.remove('uploaded');
    }

    function startUpload(file) {
        if (isUploading) return;
        if (file.type !== 'application/pdf') {
            alert('فقط فایل PDF مجاز است.');
            return;
        }

        isUploading = true;
        if (submitBtn) submitBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.value = 0;
        progressPercent.textContent = '0%';
        if (uploadingIndicator) uploadingIndicator.style.display = 'block';
        fileNameDisplay.textContent = '';

        const formData = new FormData();
        formData.append('pdf_file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'upload_temp.php', true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBar.value = percent;
                progressPercent.textContent = percent + '%';
            }
        });

        xhr.onload = function () {
            isUploading = false;
            progressContainer.style.display = 'none';
            if (uploadingIndicator) uploadingIndicator.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;

            try {
                const data = JSON.parse(xhr.responseText);
                if (data.success) {
                    fileNameDisplay.textContent = file.name;
                    uploadedTempToken = data.temp_token;
                    if (tempTokenInput) {
                        tempTokenInput.value = data.temp_token;
                    }
                    dropZone.classList.add('uploaded');
                } else {
                    alert(data.message || 'خطا در آپلود');
                    resetUpload();
                }
            } catch (e) {
                alert('پاسخ نامعتبر از سرور');
                resetUpload();
            }
        };

        xhr.onerror = function () {
            isUploading = false;
            progressContainer.style.display = 'none';
            if (uploadingIndicator) uploadingIndicator.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
            alert('خطا در اتصال به سرور');
            resetUpload();
        };

        xhr.send(formData);
    }

    if (dropZone && fileInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, function(e) {
                e.preventDefault();
                e.stopPropagation();
            }, false);
            document.body.addEventListener(eventName, function(e) {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, function() {
                dropZone.classList.add('highlight');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, function() {
                dropZone.classList.remove('highlight');
            }, false);
        });

        dropZone.addEventListener('drop', function(e) {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length) {
                fileInput.files = files;
                startUpload(files[0]);
            }
        });

        fileInput.addEventListener('change', function() {
            if (fileInput.files.length) {
                startUpload(fileInput.files[0]);
            }
        });

        // dropZone.addEventListener('click', function() {
        //     fileInput.click();
        // });
    }

    form.addEventListener('submit', function (e) {
        if (uploadedTempToken) {
            return true;
        }



        var isEdit = document.querySelector('input[name="edit_mode"]');
        if ((!fileInput || !fileInput.files.length) && !isEdit) {
            e.preventDefault();
            alert('لطفاً فایل PDF را انتخاب کنید.');
            return false;
        }
        
        
        
        

        e.preventDefault();
        submitBtn.disabled = true;
        progressContainer.style.display = 'block';
        progressBar.value = 0;
        progressPercent.textContent = '0%';

        const formData = new FormData(form);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', form.action, true);
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');

        xhr.upload.addEventListener('progress', function (e) {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                progressBar.value = percent;
                progressPercent.textContent = percent + '%';
            }
        });

        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        if (response.redirect) {
                            window.location.href = response.redirect;
                        } else {
                            alert(response.message || 'عملیات موفق');
                            window.location.reload();
                        }
                    } else {
                        alert(response.message || 'خطا');
                        submitBtn.disabled = false;
                        progressContainer.style.display = 'none';
                    }
                } catch (err) {
                    alert('پاسخ نامعتبر');
                    submitBtn.disabled = false;
                    progressContainer.style.display = 'none';
                }
            } else {
                alert('خطای سرور');
                submitBtn.disabled = false;
                progressContainer.style.display = 'none';
            }
        };

        xhr.onerror = function () {
            alert('خطای شبکه');
            submitBtn.disabled = false;
            progressContainer.style.display = 'none';
        };

        xhr.send(formData);
    });
    
    
    
    
    function showToast(message) {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, 2000);
    }
    
    const mobileInput = document.getElementById('mobile');
    if (mobileInput) {
        mobileInput.addEventListener('input', function(e) {
            const invalid = /[^0-9+\- ()]/g;
            const original = this.value;
            const cleaned = original.replace(invalid, '');
            if (original !== cleaned) {
                this.value = cleaned;
                showToast('فقط اعداد انگلیسی مجاز هستند');
            }
        });
    
        mobileInput.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Backspace' || e.key === 'Delete' || e.key.startsWith('Arrow')) return;
            if (!/^[0-9+\- ()]$/.test(e.key) && e.key.length === 1) {
                e.preventDefault();
                showToast('فقط اعداد انگلیسی مجاز هستند');
            }
        });
    }



});