import {
  validateFileType,
  getAllowedExtensions,
  getBlockedExtensions,
} from '../../utils/fileValidation';

describe('File Validation', () => {
  describe('validateFileType', () => {
    describe('allowed extensions', () => {
      it('should allow model files', () => {
        expect(validateFileType('model.safetensors').allowed).toBe(true);
        expect(validateFileType('model.bin').allowed).toBe(true);
        expect(validateFileType('model.pt').allowed).toBe(true);
        expect(validateFileType('model.pth').allowed).toBe(true);
        expect(validateFileType('model.onnx').allowed).toBe(true);
        expect(validateFileType('model.gguf').allowed).toBe(true);
        expect(validateFileType('model.h5').allowed).toBe(true);
      });

      it('should allow data files', () => {
        expect(validateFileType('data.csv').allowed).toBe(true);
        expect(validateFileType('data.json').allowed).toBe(true);
        expect(validateFileType('data.jsonl').allowed).toBe(true);
        expect(validateFileType('data.parquet').allowed).toBe(true);
        expect(validateFileType('data.arrow').allowed).toBe(true);
        expect(validateFileType('data.feather').allowed).toBe(true);
      });

      it('should allow text files', () => {
        expect(validateFileType('readme.txt').allowed).toBe(true);
        expect(validateFileType('readme.md').allowed).toBe(true);
        expect(validateFileType('config.yaml').allowed).toBe(true);
        expect(validateFileType('config.yml').allowed).toBe(true);
      });

      it('should allow archives', () => {
        expect(validateFileType('archive.tar').allowed).toBe(true);
        expect(validateFileType('archive.gz').allowed).toBe(true);
        expect(validateFileType('archive.zip').allowed).toBe(true);
        expect(validateFileType('archive.tgz').allowed).toBe(true);
      });

      it('should allow images', () => {
        expect(validateFileType('image.jpg').allowed).toBe(true);
        expect(validateFileType('image.jpeg').allowed).toBe(true);
        expect(validateFileType('image.png').allowed).toBe(true);
        expect(validateFileType('image.gif').allowed).toBe(true);
        expect(validateFileType('image.bmp').allowed).toBe(true);
      });

      it('should allow audio/video files', () => {
        expect(validateFileType('audio.wav').allowed).toBe(true);
        expect(validateFileType('audio.mp3').allowed).toBe(true);
        expect(validateFileType('video.mp4').allowed).toBe(true);
        expect(validateFileType('video.avi').allowed).toBe(true);
      });

      it('should allow notebooks', () => {
        expect(validateFileType('notebook.ipynb').allowed).toBe(true);
      });

      it('should allow document files', () => {
        expect(validateFileType('document.pdf').allowed).toBe(true);
        expect(validateFileType('document.doc').allowed).toBe(true);
        expect(validateFileType('document.docx').allowed).toBe(true);
        expect(validateFileType('spreadsheet.xls').allowed).toBe(true);
        expect(validateFileType('spreadsheet.xlsx').allowed).toBe(true);
        expect(validateFileType('presentation.ppt').allowed).toBe(true);
        expect(validateFileType('presentation.pptx').allowed).toBe(true);
        expect(validateFileType('document.odt').allowed).toBe(true);
        expect(validateFileType('spreadsheet.ods').allowed).toBe(true);
        expect(validateFileType('presentation.odp').allowed).toBe(true);
        expect(validateFileType('document.rtf').allowed).toBe(true);
      });

      it('should allow markup and style files', () => {
        expect(validateFileType('data.xml').allowed).toBe(true);
        expect(validateFileType('page.html').allowed).toBe(true);
        expect(validateFileType('style.css').allowed).toBe(true);
      });

      it('should allow backup and misc files', () => {
        expect(validateFileType('file.old').allowed).toBe(true);
        expect(validateFileType('file.bak').allowed).toBe(true);
        expect(validateFileType('file.backup').allowed).toBe(true);
        expect(validateFileType('file.tmp').allowed).toBe(true);
      });

      it('should allow log and SQL files', () => {
        expect(validateFileType('app.log').allowed).toBe(true);
        expect(validateFileType('query.sql').allowed).toBe(true);
      });
    });

    describe('blocked extensions', () => {
      it('should block executables', () => {
        const result = validateFileType('malware.exe');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('blocked for security reasons');
      });

      it('should block scripts', () => {
        expect(validateFileType('script.js').allowed).toBe(false);
        expect(validateFileType('script.ts').allowed).toBe(false);
        expect(validateFileType('script.py').allowed).toBe(false);
        expect(validateFileType('script.rb').allowed).toBe(false);
        expect(validateFileType('script.pl').allowed).toBe(false);
        expect(validateFileType('script.php').allowed).toBe(false);
      });

      it('should block shell scripts', () => {
        expect(validateFileType('script.sh').allowed).toBe(false);
        expect(validateFileType('script.bat').allowed).toBe(false);
        expect(validateFileType('script.cmd').allowed).toBe(false);
      });

      it('should block system files', () => {
        expect(validateFileType('driver.dll').allowed).toBe(false);
        expect(validateFileType('library.so').allowed).toBe(false);
        expect(validateFileType('library.dylib').allowed).toBe(false);
        expect(validateFileType('system.sys').allowed).toBe(false);
        expect(validateFileType('driver.drv').allowed).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should reject files without extensions', () => {
        const result = validateFileType('noextension');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('without extensions');
      });

      it('should be case insensitive', () => {
        expect(validateFileType('image.JPG').allowed).toBe(true);
        expect(validateFileType('image.PNG').allowed).toBe(true);
        expect(validateFileType('model.SAFETENSORS').allowed).toBe(true);
        expect(validateFileType('malware.EXE').allowed).toBe(false);
      });

      it('should handle multiple dots in filename', () => {
        expect(validateFileType('my.file.name.csv').allowed).toBe(true);
        expect(validateFileType('my.file.name.exe').allowed).toBe(false);
      });

      it('should reject unknown extensions', () => {
        const result = validateFileType('file.xyz');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('not in the allowed list');
      });
    });

    describe('blocked list precedence', () => {
      it('should block extensions even if they could be data files', () => {
        // Even though .js could theoretically be a data file, it's blocked
        const result = validateFileType('data.js');
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('blocked for security reasons');
      });
    });
  });

  describe('getAllowedExtensions', () => {
    it('should return array of allowed extensions', () => {
      const extensions = getAllowedExtensions();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
      expect(extensions).toContain('.safetensors');
      expect(extensions).toContain('.csv');
      expect(extensions).toContain('.json');
      expect(extensions).toContain('.pdf'); // New document type
    });

    it('should return a copy of the array', () => {
      const extensions1 = getAllowedExtensions();
      const extensions2 = getAllowedExtensions();
      expect(extensions1).toEqual(extensions2);
      expect(extensions1).not.toBe(extensions2); // Different array instances
    });
  });

  describe('getBlockedExtensions', () => {
    it('should return array of blocked extensions', () => {
      const extensions = getBlockedExtensions();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
      expect(extensions).toContain('.exe');
      expect(extensions).toContain('.sh');
      expect(extensions).toContain('.js');
    });

    it('should return a copy of the array', () => {
      const extensions1 = getBlockedExtensions();
      const extensions2 = getBlockedExtensions();
      expect(extensions1).toEqual(extensions2);
      expect(extensions1).not.toBe(extensions2); // Different array instances
    });
  });

  describe('environment variable configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      jest.resetModules();
    });

    describe('ALLOWED_FILE_EXTENSIONS override', () => {
      it('should override default allowed extensions', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = '.custom,.proprietary';
        const { validateFileType: validate, getAllowedExtensions: getAllowed } = await import(
          '../../utils/fileValidation'
        );

        const allowed = getAllowed();
        expect(allowed).toEqual(['.custom', '.proprietary']);
        expect(validate('file.custom').allowed).toBe(true);
        expect(validate('file.proprietary').allowed).toBe(true);
        expect(validate('file.pdf').allowed).toBe(false); // Default not included
      });

      it('should handle extensions without dots', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = 'txt,pdf,docx';
        const { getAllowedExtensions: getAllowed } = await import('../../utils/fileValidation');

        const allowed = getAllowed();
        expect(allowed).toEqual(['.txt', '.pdf', '.docx']);
      });

      it('should handle uppercase extensions', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = '.PDF,.TXT';
        const { validateFileType: validate } = await import('../../utils/fileValidation');

        expect(validate('file.pdf').allowed).toBe(true);
        expect(validate('file.txt').allowed).toBe(true);
      });
    });

    describe('ALLOWED_FILE_EXTENSIONS_APPEND append', () => {
      it('should append to default allowed extensions', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS_APPEND = '.custom,.proprietary';
        const { validateFileType: validate, getAllowedExtensions: getAllowed } = await import(
          '../../utils/fileValidation'
        );

        const allowed = getAllowed();
        expect(allowed).toContain('.pdf'); // Default included
        expect(allowed).toContain('.custom'); // Appended
        expect(allowed).toContain('.proprietary'); // Appended
        expect(validate('file.pdf').allowed).toBe(true);
        expect(validate('file.custom').allowed).toBe(true);
      });
    });

    describe('BLOCKED_FILE_EXTENSIONS override', () => {
      it('should override default blocked extensions', async () => {
        process.env.BLOCKED_FILE_EXTENSIONS = '.dangerous';
        const { validateFileType: validate, getBlockedExtensions: getBlocked } = await import(
          '../../utils/fileValidation'
        );

        const blocked = getBlocked();
        expect(blocked).toEqual(['.dangerous']);
        expect(validate('file.dangerous').allowed).toBe(false);
        // Even though .exe is no longer in blocked list, it's still not in allowed list
        expect(validate('file.exe').allowed).toBe(false);
        expect(validate('file.exe').reason).toContain('not in the allowed list');
      });
    });

    describe('BLOCKED_FILE_EXTENSIONS_APPEND append', () => {
      it('should append to default blocked extensions', async () => {
        process.env.BLOCKED_FILE_EXTENSIONS_APPEND = '.dangerous';
        const { validateFileType: validate, getBlockedExtensions: getBlocked } = await import(
          '../../utils/fileValidation'
        );

        const blocked = getBlocked();
        expect(blocked).toContain('.exe'); // Default included
        expect(blocked).toContain('.dangerous'); // Appended
        expect(validate('file.exe').allowed).toBe(false);
        expect(validate('file.dangerous').allowed).toBe(false);
      });
    });

    describe('priority and edge cases', () => {
      it('should prioritize override over append for allowed extensions', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = '.override';
        process.env.ALLOWED_FILE_EXTENSIONS_APPEND = '.append';
        const { getAllowedExtensions: getAllowed } = await import('../../utils/fileValidation');

        const allowed = getAllowed();
        expect(allowed).toEqual(['.override']);
        expect(allowed).not.toContain('.append');
      });

      it('should prioritize override over append for blocked extensions', async () => {
        process.env.BLOCKED_FILE_EXTENSIONS = '.override';
        process.env.BLOCKED_FILE_EXTENSIONS_APPEND = '.append';
        const { getBlockedExtensions: getBlocked } = await import('../../utils/fileValidation');

        const blocked = getBlocked();
        expect(blocked).toEqual(['.override']);
        expect(blocked).not.toContain('.append');
      });

      it('should handle empty environment variables', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = '';
        const { getAllowedExtensions: getAllowed } = await import('../../utils/fileValidation');

        const allowed = getAllowed();
        expect(allowed).toEqual([]); // Override with empty = no extensions allowed
      });

      it('should trim whitespace and filter empty entries', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS = ' .txt , .pdf , , .docx ';
        const { getAllowedExtensions: getAllowed } = await import('../../utils/fileValidation');

        const allowed = getAllowed();
        expect(allowed).toEqual(['.txt', '.pdf', '.docx']);
      });

      it('should handle blocked list taking precedence over allowed list with env vars', async () => {
        process.env.ALLOWED_FILE_EXTENSIONS_APPEND = '.dangerous';
        process.env.BLOCKED_FILE_EXTENSIONS_APPEND = '.dangerous';
        const { validateFileType: validate } = await import('../../utils/fileValidation');

        // Blocked list should take precedence
        expect(validate('file.dangerous').allowed).toBe(false);
      });
    });
  });
});
