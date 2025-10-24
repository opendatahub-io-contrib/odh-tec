import { validateFileType, getAllowedExtensions } from '../../utils/fileValidation';

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
    });

    it('should return a copy of the array', () => {
      const extensions1 = getAllowedExtensions();
      const extensions2 = getAllowedExtensions();
      expect(extensions1).toEqual(extensions2);
      expect(extensions1).not.toBe(extensions2); // Different array instances
    });
  });
});
