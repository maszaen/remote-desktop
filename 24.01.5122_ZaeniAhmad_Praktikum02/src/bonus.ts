/**
 * File: bonus.ts
 * BONUS - Sistem Informasi Akademik Sederhana
 * Menggabungkan kelas Mahasiswa, Dosen, dan MataKuliah
 */

// ===================== KELAS MAHASISWA =====================
class Mahasiswa {
  nama: string;
  nim: string;
  email: string;

  constructor(nama: string, nim: string, email: string) {
    this.nama = nama;
    this.nim = nim;
    this.email = email;
  }

  info(): void {
    console.log(`  👤 ${this.nama.padEnd(22)} | NIM: ${this.nim} | ${this.email}`);
  }

  isValid(): boolean {
    return (
      this.nama.trim().length > 0 &&
      /^DT\d{5}$/.test(this.nim) &&
      this.email.includes("@") && this.email.includes(".")
    );
  }
}

// ===================== KELAS DOSEN =====================
class Dosen {
  nama: string;
  nip: string;
  bidang: string;

  constructor(nama: string, nip: string, bidang: string) {
    this.nama = nama;
    this.nip = nip;
    this.bidang = bidang;
  }

  info(): void {
    console.log(`  👨‍🏫 ${this.nama.padEnd(25)} | NIP: ${this.nip} | Bidang: ${this.bidang}`);
  }

  mengajar(mataKuliah: string): void {
    console.log(`    📖 ${this.nama} mengajar mata kuliah ${mataKuliah}`);
  }
}

// ===================== KELAS MATA KULIAH =====================
class MataKuliah {
  kodeMK: string;
  namaMK: string;
  sks: number;
  dosenPengampu: string;
  static totalMataKuliah: number = 0;

  constructor(kodeMK: string, namaMK: string, sks: number, dosenPengampu: string) {
    this.kodeMK = kodeMK;
    this.namaMK = namaMK;
    this.sks = sks;
    this.dosenPengampu = dosenPengampu;
    MataKuliah.totalMataKuliah++;
  }

  infoMK(): void {
    console.log(`  📚 [${this.kodeMK}] ${this.namaMK.padEnd(35)} | ${this.sks} SKS | ${this.dosenPengampu}`);
  }

  ubahDosen(dosenBaru: string): void {
    this.dosenPengampu = dosenBaru;
    console.log(`  🔄 [${this.kodeMK}] Dosen diperbarui → ${dosenBaru}`);
  }
}

// ===================== KELAS JADWAL (Relasi) =====================
interface JadwalKuliah {
  mataKuliah: MataKuliah;
  dosen: Dosen;
  mahasiswaDaftar: Mahasiswa[];
  hari: string;
  jam: string;
  ruangan: string;
}

// ===================== SISTEM INFORMASI AKADEMIK =====================
class SistemInformasiAkademik {
  private namaSistem: string;
  private daftarMahasiswa: Mahasiswa[] = [];
  private daftarDosen: Dosen[] = [];
  private daftarMataKuliah: MataKuliah[] = [];
  private jadwalKuliah: JadwalKuliah[] = [];

  constructor(namaSistem: string) {
    this.namaSistem = namaSistem;
    console.log(`🏫 Sistem "${this.namaSistem}" berhasil diinisialisasi.\n`);
  }

  // --- MANAJEMEN MAHASISWA ---
  tambahMahasiswa(mhs: Mahasiswa): void {
    if (!mhs.isValid()) {
      console.log(`  ⚠️  Data mahasiswa "${mhs.nama}" tidak valid, tidak ditambahkan.`);
      return;
    }
    this.daftarMahasiswa.push(mhs);
    console.log(`  ✅ Mahasiswa "${mhs.nama}" ditambahkan.`);
  }

  tampilkanMahasiswa(): void {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║       DAFTAR MAHASISWA (${this.daftarMahasiswa.length} terdaftar)               ║`);
    console.log("╚══════════════════════════════════════════════════════╝");
    if (this.daftarMahasiswa.length === 0) {
      console.log("  (Belum ada mahasiswa terdaftar)");
      return;
    }
    this.daftarMahasiswa.forEach((mhs, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. 👤 ${mhs.nama.padEnd(22)} | NIM: ${mhs.nim} | ${mhs.email}`);
    });
  }

  // --- MANAJEMEN DOSEN ---
  tambahDosen(dosen: Dosen): void {
    this.daftarDosen.push(dosen);
    console.log(`  ✅ Dosen "${dosen.nama}" ditambahkan.`);
  }

  tampilkanDosen(): void {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║          DAFTAR DOSEN (${this.daftarDosen.length} terdaftar)                  ║`);
    console.log("╚══════════════════════════════════════════════════════╝");
    if (this.daftarDosen.length === 0) {
      console.log("  (Belum ada dosen terdaftar)");
      return;
    }
    this.daftarDosen.forEach((dosen, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. 👨‍🏫 ${dosen.nama.padEnd(25)} | NIP: ${dosen.nip} | Bidang: ${dosen.bidang}`);
    });
  }

  // --- MANAJEMEN MATA KULIAH ---
  tambahMataKuliah(mk: MataKuliah): void {
    this.daftarMataKuliah.push(mk);
    console.log(`  ✅ Mata kuliah "[${mk.kodeMK}] ${mk.namaMK}" ditambahkan.`);
  }

  tampilkanMataKuliah(): void {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║       DAFTAR MATA KULIAH (${this.daftarMataKuliah.length} terdaftar)             ║`);
    console.log("╚══════════════════════════════════════════════════════╝");
    if (this.daftarMataKuliah.length === 0) {
      console.log("  (Belum ada mata kuliah terdaftar)");
      return;
    }
    this.daftarMataKuliah.forEach((mk, i) => {
      console.log(`  ${(i + 1).toString().padStart(2)}. 📚 [${mk.kodeMK}] ${mk.namaMK.padEnd(35)} | ${mk.sks} SKS | ${mk.dosenPengampu}`);
    });
  }

  // --- MANAJEMEN JADWAL ---
  tambahJadwal(jadwal: JadwalKuliah): void {
    this.jadwalKuliah.push(jadwal);
  }

  tampilkanJadwal(): void {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║     JADWAL PERKULIAHAN (${this.jadwalKuliah.length} jadwal aktif)              ║`);
    console.log("╚══════════════════════════════════════════════════════╝");
    if (this.jadwalKuliah.length === 0) {
      console.log("  (Belum ada jadwal terdaftar)");
      return;
    }
    this.jadwalKuliah.forEach((jadwal, i) => {
      console.log(`\n  📅 Jadwal ${i + 1}: ${jadwal.mataKuliah.namaMK}`);
      console.log(`     Dosen   : ${jadwal.dosen.nama}`);
      console.log(`     Waktu   : ${jadwal.hari}, ${jadwal.jam}`);
      console.log(`     Ruangan : ${jadwal.ruangan}`);
      console.log(`     Peserta : ${jadwal.mahasiswaDaftar.length} mahasiswa`);
      jadwal.mahasiswaDaftar.forEach(mhs => {
        console.log(`               - ${mhs.nama} (${mhs.nim})`);
      });
    });
  }

  // --- RINGKASAN SISTEM ---
  tampilkanRingkasan(): void {
    console.log("\n╔══════════════════════════════════════════════════════╗");
    console.log(`║              RINGKASAN SISTEM                        ║`);
    console.log("╠══════════════════════════════════════════════════════╣");
    console.log(`║  Total Mahasiswa  : ${this.daftarMahasiswa.length.toString().padEnd(33)}║`);
    console.log(`║  Total Dosen      : ${this.daftarDosen.length.toString().padEnd(33)}║`);
    console.log(`║  Total Mata Kuliah: ${this.daftarMataKuliah.length.toString().padEnd(33)}║`);
    console.log(`║  Total Jadwal     : ${this.jadwalKuliah.length.toString().padEnd(33)}║`);
    console.log("╚══════════════════════════════════════════════════════╝");
  }
}

// ===================== PROGRAM UTAMA =====================
console.log("══════════════════════════════════════════════════════");
console.log("   BONUS: SISTEM INFORMASI AKADEMIK");
console.log("══════════════════════════════════════════════════════\n");

// Inisialisasi sistem
const sia = new SistemInformasiAkademik("SIA Universitas Teknologi Digital");

// --- Data Dosen ---
const dosen1 = new Dosen("Dr. Andi Wijaya, M.Kom", "198501012010011001", "Pemrograman");
const dosen2 = new Dosen("Budi Hartono, S.T., M.T.", "197803152005011002", "Jaringan Komputer");
const dosen3 = new Dosen("Dr. Citra Lestari, M.Cs.", "199002202015042003", "Kecerdasan Buatan");

console.log(">> Menambahkan data dosen...");
sia.tambahDosen(dosen1);
sia.tambahDosen(dosen2);
sia.tambahDosen(dosen3);

// --- Data Mata Kuliah ---
const mk1 = new MataKuliah("TI301", "Pemrograman Berorientasi Objek", 3, dosen1.nama);
const mk2 = new MataKuliah("TI302", "Basis Data", 3, dosen2.nama);
const mk3 = new MataKuliah("TI303", "Kecerdasan Buatan", 2, dosen3.nama);
const mk4 = new MataKuliah("TI304", "Jaringan Komputer", 3, dosen2.nama);

console.log("\n>> Menambahkan data mata kuliah...");
sia.tambahMataKuliah(mk1);
sia.tambahMataKuliah(mk2);
sia.tambahMataKuliah(mk3);
sia.tambahMataKuliah(mk4);

// --- Data Mahasiswa ---
const mhs1 = new Mahasiswa("Ahmad Fauzi", "DT23001", "ahmad.fauzi@email.com");
const mhs2 = new Mahasiswa("Budi Raharjo", "DT23002", "budi.raharjo@kampus.ac.id");
const mhs3 = new Mahasiswa("Citra Amelia", "DT23003", "citra.amelia@gmail.com");
const mhs4 = new Mahasiswa("Deni Saputra", "DT23004", "deni.saputra@email.com");
const mhs5 = new Mahasiswa("Eka Putri", "DT23005", "eka.putri@email.com");
const mhsInvalid = new Mahasiswa("", "INVALID", "bukan-email"); // Data tidak valid

console.log("\n>> Menambahkan data mahasiswa...");
sia.tambahMahasiswa(mhs1);
sia.tambahMahasiswa(mhs2);
sia.tambahMahasiswa(mhs3);
sia.tambahMahasiswa(mhs4);
sia.tambahMahasiswa(mhs5);
sia.tambahMahasiswa(mhsInvalid); // Seharusnya ditolak

// --- Jadwal Kuliah ---
const jadwal1: JadwalKuliah = {
  mataKuliah: mk1,
  dosen: dosen1,
  mahasiswaDaftar: [mhs1, mhs2, mhs3],
  hari: "Senin",
  jam: "08:00 - 10:30",
  ruangan: "Lab Komputer A",
};

const jadwal2: JadwalKuliah = {
  mataKuliah: mk2,
  dosen: dosen2,
  mahasiswaDaftar: [mhs1, mhs4, mhs5],
  hari: "Selasa",
  jam: "10:00 - 12:30",
  ruangan: "Ruang 201",
};

const jadwal3: JadwalKuliah = {
  mataKuliah: mk3,
  dosen: dosen3,
  mahasiswaDaftar: [mhs2, mhs3, mhs4, mhs5],
  hari: "Rabu",
  jam: "13:00 - 14:40",
  ruangan: "Lab AI",
};

sia.tambahJadwal(jadwal1);
sia.tambahJadwal(jadwal2);
sia.tambahJadwal(jadwal3);

// ===================== TAMPILKAN SEMUA DATA =====================
sia.tampilkanMahasiswa();
sia.tampilkanDosen();
sia.tampilkanMataKuliah();
sia.tampilkanJadwal();
sia.tampilkanRingkasan();

console.log("\n══════════════════════════════════════════════════════");
console.log("   AKHIR PROGRAM BONUS");
console.log("══════════════════════════════════════════════════════\n");