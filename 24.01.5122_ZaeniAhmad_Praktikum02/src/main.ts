/**
 * File: main.ts
 * Program Utama - PBO Praktikum 02
 * Kelas dan Objek: Deklarasi, Instansiasi, Atribut, dan Metode
 *
 * Menggabungkan:
 *   - Soal 1: Kelas Mahasiswa  (mahasiswa.ts)
 *   - Soal 2: Kelas Dosen      (dosen.ts)
 *   - Soal 3: Kelas MataKuliah (matakuliah.ts)
 */

import { Mahasiswa  } from "./mahasiswa";
import { Dosen      } from "./dosen";
import { MataKuliah } from "./matakuliah";

// ============================================================
//  HEADER
// ============================================================
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║          PROGRAM UTAMA - PBO PRAKTIKUM 02               ║");
console.log("║   Kelas dan Objek: Deklarasi, Instansiasi, Atribut,     ║");
console.log("║                   dan Metode                            ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

// ============================================================
//  SOAL 1 - KELAS MAHASISWA
// ============================================================
console.log("══════════════════════════════════════════════════════════");
console.log("  SOAL 1: Kelas Mahasiswa dengan Validasi");
console.log("══════════════════════════════════════════════════════════\n");

// Instansiasi objek Mahasiswa
const mhs1 = new Mahasiswa("Ahmad Fauzi",  "DT23001", "ahmad.fauzi@email.com");
const mhs2 = new Mahasiswa("Budi Raharjo", "DT23002", "budi.raharjo@kampus.ac.id");
const mhs3 = new Mahasiswa("Citra Amelia", "DT23003", "citra.amelia@gmail.com");

// Data tidak valid — untuk demo validasi
const mhsInvalid1 = new Mahasiswa("",            "DT23004",  "email@valid.com");     // nama kosong
const mhsInvalid2 = new Mahasiswa("Deni Saputra", "23005",   "deni@email.com");      // NIM salah
const mhsInvalid3 = new Mahasiswa("Eka Putri",    "DT23006", "emailtanpasimbol");    // email salah

console.log(">> Data Mahasiswa Valid:\n");
mhs1.info();
mhs2.info();
mhs3.info();

console.log(">> Data Mahasiswa Tidak Valid:\n");
mhsInvalid1.info();
mhsInvalid2.info();
mhsInvalid3.info();

console.log(">> Detail Validasi Per-Field:\n");
mhs1.cekValidasi();
mhsInvalid1.cekValidasi();
mhsInvalid2.cekValidasi();
mhsInvalid3.cekValidasi();

// ============================================================
//  SOAL 2 - KELAS DOSEN
// ============================================================
console.log("\n══════════════════════════════════════════════════════════");
console.log("  SOAL 2: Kelas Dosen");
console.log("══════════════════════════════════════════════════════════\n");

// Instansiasi minimal 3 objek Dosen
const dosen1 = new Dosen("Dr. Andi Wijaya, M.Kom",   "198501012010011001", "Pemrograman");
const dosen2 = new Dosen("Budi Hartono, S.T., M.T.", "197803152005011002", "Jaringan Komputer");
const dosen3 = new Dosen("Dr. Citra Lestari, M.Cs.", "199002202015042003", "Kecerdasan Buatan");

console.log(">> Data Dosen:\n");
dosen1.info();
dosen2.info();
dosen3.info();

console.log(">> Jadwal Mengajar:\n");
dosen1.mengajar("Pemrograman Berorientasi Objek");
dosen1.mengajar("Algoritma dan Pemrograman");
dosen2.mengajar("Jaringan Komputer");
dosen2.mengajar("Keamanan Jaringan");
dosen3.mengajar("Kecerdasan Buatan");
dosen3.mengajar("Machine Learning");

// ============================================================
//  SOAL 3 - KELAS MATA KULIAH
// ============================================================
console.log("\n══════════════════════════════════════════════════════════");
console.log("  SOAL 3: Kelas MataKuliah");
console.log("══════════════════════════════════════════════════════════\n");

console.log(`Total awal: ${MataKuliah.totalMataKuliah}\n`);

// Instansiasi minimal 3 objek MataKuliah
const mk1 = new MataKuliah("TI301", "Pemrograman Berorientasi Objek", 3, dosen1.nama);
const mk2 = new MataKuliah("TI302", "Basis Data",                     3, dosen2.nama);
const mk3 = new MataKuliah("TI303", "Kecerdasan Buatan",              2, dosen3.nama);
const mk4 = new MataKuliah("TI304", "Jaringan Komputer",              3, dosen2.nama);

console.log("\n>> Data Mata Kuliah:\n");
mk1.infoMK();
mk2.infoMK();
mk3.infoMK();
mk4.infoMK();

console.log(">> Ubah Dosen Pengampu:\n");
mk2.ubahDosen("Dr. Eka Rahmawati, M.Cs.");
mk4.ubahDosen("Fajar Nugroho, S.Kom., M.T.");

console.log("\n>> Data Setelah Perubahan:\n");
mk2.infoMK();
mk4.infoMK();

console.log(`\n📊 ${MataKuliah.getTotalMataKuliah()}`);

// ============================================================
//  RINGKASAN
// ============================================================
console.log("\n══════════════════════════════════════════════════════════");
console.log("  RINGKASAN PROGRAM");
console.log("══════════════════════════════════════════════════════════\n");
console.log(`  Total Mahasiswa  : 3 (+ 3 data tidak valid sebagai demo)`);
console.log(`  Total Dosen      : 3`);
console.log(`  Total Mata Kuliah: ${MataKuliah.totalMataKuliah}`);

console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║               PROGRAM SELESAI ✅                        ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");