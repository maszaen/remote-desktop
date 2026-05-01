/**
 * File: matakuliah.ts
 * Soal 3 - Kelas MataKuliah (Bobot 40%)
 * Atribut: kodeMK, namaMK, sks, dosenPengampu
 * Metode: infoMK(), ubahDosen()
 * Static: totalMataKuliah, getTotalMataKuliah()
 */

class MataKuliah {
  // ========== ATRIBUT INSTANCE ==========
  kodeMK: string;
  namaMK: string;
  sks: number;
  dosenPengampu: string;

  // ========== STATIC ATTRIBUTE ==========
  static totalMataKuliah: number = 0;

  // ========== CONSTRUCTOR ==========
  constructor(kodeMK: string, namaMK: string, sks: number, dosenPengampu: string) {
    this.kodeMK        = kodeMK;
    this.namaMK        = namaMK;
    this.sks           = sks;
    this.dosenPengampu = dosenPengampu;
    MataKuliah.totalMataKuliah++;
  }

  // ========== METODE INFOMK() ==========
  infoMK(): void {
    console.log("┌─────────────────────────────────────────┐");
    console.log("│           DATA MATA KULIAH               │");
    console.log("├─────────────────────────────────────────┤");
    console.log(`│ Kode MK       : ${this.kodeMK.padEnd(24)}│`);
    console.log(`│ Nama MK       : ${this.namaMK.padEnd(24)}│`);
    console.log(`│ SKS           : ${this.sks.toString().padEnd(24)}│`);
    console.log(`│ Dosen Pengampu: ${this.dosenPengampu.padEnd(24)}│`);
    console.log("└─────────────────────────────────────────┘");
  }

  // ========== METODE UBAHDOSEN() ==========
  ubahDosen(dosenBaru: string): void {
    const dosenLama    = this.dosenPengampu;
    this.dosenPengampu = dosenBaru;
    console.log(`🔄 [${this.kodeMK}] Dosen pengampu diperbarui:`);
    console.log(`   Sebelumnya : ${dosenLama}`);
    console.log(`   Sekarang   : ${dosenBaru}`);
  }

  // ========== STATIC METHOD ==========
  static getTotalMataKuliah(): string {
    return `Total mata kuliah terdaftar: ${MataKuliah.totalMataKuliah}`;
  }
}

export { MataKuliah };