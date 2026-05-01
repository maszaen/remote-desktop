/**
 * File: dosen.ts
 * Soal 2 - Kelas Dosen (Bobot 30%)
 * Atribut: nama, nip, bidang
 * Metode: info(), mengajar(mataKuliah)
 */

class Dosen {
  // ========== ATRIBUT ==========
  nama: string;
  nip: string;
  bidang: string;

  // ========== CONSTRUCTOR ==========
  constructor(nama: string, nip: string, bidang: string) {
    this.nama   = nama;
    this.nip    = nip;
    this.bidang = bidang;
  }

  // ========== METODE INFO() ==========
  info(): void {
    console.log("┌─────────────────────────────────────┐");
    console.log("│            DATA DOSEN                │");
    console.log("├─────────────────────────────────────┤");
    console.log(`│ Nama   : ${this.nama.padEnd(27)}│`);
    console.log(`│ NIP    : ${this.nip.padEnd(27)}│`);
    console.log(`│ Bidang : ${this.bidang.padEnd(27)}│`);
    console.log("└─────────────────────────────────────┘");
  }

  // ========== METODE MENGAJAR() ==========
  mengajar(mataKuliah: string): void {
    console.log(`📖 ${this.nama} mengajar mata kuliah ${mataKuliah}`);
  }
}

export { Dosen };