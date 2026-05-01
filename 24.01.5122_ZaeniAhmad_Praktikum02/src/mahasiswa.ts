/**
 * File: mahasiswa.ts
 * Soal 1 - Kelas Mahasiswa dengan Validasi (Bobot 30%)
 * Atribut: nama, nim, email
 * Metode: info(), isValid(), cekValidasi()
 */

class Mahasiswa {
  // ========== ATRIBUT ==========
  nama: string;
  nim: string;
  email: string;

  // ========== CONSTRUCTOR ==========
  constructor(nama: string, nim: string, email: string) {
    this.nama  = nama;
    this.nim   = nim;
    this.email = email;
  }

  // ========== METODE INFO() ==========
  info(): void {
    console.log("┌─────────────────────────────────────┐");
    console.log("│          DATA MAHASISWA              │");
    console.log("├─────────────────────────────────────┤");
    console.log(`│ Nama  : ${this.nama.padEnd(28)}│`);
    console.log(`│ NIM   : ${this.nim.padEnd(28)}│`);
    console.log(`│ Email : ${this.email.padEnd(28)}│`);
    console.log(`│ Valid : ${(this.isValid() ? "✅ YA" : "❌ TIDAK").padEnd(28)}│`);
    console.log("└─────────────────────────────────────┘");
  }

  // ========== METODE ISVALID() ==========
  isValid(): boolean {
    const namaValid  = this.nama.trim().length > 0;
    const nimValid   = /^DT\d{5}$/.test(this.nim);
    const emailValid = this.email.includes("@") && this.email.includes(".");
    return namaValid && nimValid && emailValid;
  }

  // ========== DETAIL PER-FIELD ==========
  cekValidasi(): void {
    console.log(`🔍 Validasi untuk: "${this.nama || "(kosong)"}"`);
    console.log(`   Nama  : ${this.nama.trim().length > 0 ? "✅ Valid" : "❌ Tidak boleh kosong"}`);
    console.log(`   NIM   : ${/^DT\d{5}$/.test(this.nim) ? "✅ Valid" : "❌ Harus format DTxxxxx (contoh: DT23001)"}`);
    console.log(`   Email : ${this.email.includes("@") && this.email.includes(".") ? "✅ Valid" : "❌ Harus mengandung '@' dan '.'"}`);
  }
}

export { Mahasiswa };