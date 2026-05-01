# Laporan Praktikum 02 - PBO

## Identitas Mahasiswa
- **Nama**: Zaeni Ahmad
- **NIM**: 24.01.5122
- **Kelas**: (Diisi sesuai kelas)
- **Praktikum**: 02 - Kelas dan Objek

## Penjelasan Singkat Setiap Program

1. **mahasiswa.ts (Soal 1)**
   File ini mendefinisikan kelas `Mahasiswa` yang memiliki atribut `nama`, `nim`, dan `email`. Kelas ini dilengkapi dengan constructor untuk inisialisasi, metode `info()` untuk menampilkan data, dan metode `isValid()` untuk memvalidasi data berdasarkan aturan (nama tidak kosong, NIM berformat DTxxxxx, email mengandung @ dan .).

2. **dosen.ts (Soal 2)**
   File ini mendefinisikan kelas `Dosen` dengan atribut `nama`, `nip`, dan `bidang`. Dilengkapi dengan constructor, metode `info()` untuk menampilkan data dosen, dan metode `mengajar()` untuk menampilkan mata kuliah yang diajarkan oleh dosen tersebut.

3. **matakuliah.ts (Soal 3)**
   File ini berisi kelas `MataKuliah` dengan atribut `kodeMK`, `namaMK`, `sks`, dan `dosenPengampu`, beserta atribut statis `totalMataKuliah` untuk menghitung jumlah mata kuliah yang diinstansiasi. Terdapat metode `infoMK()` dan `ubahDosen()` untuk mengganti dosen pengampu.

4. **main.ts (Program Utama)**
   File ini mengimpor kelas `Mahasiswa`, `Dosen`, dan `MataKuliah`, kemudian menginstansiasinya menjadi objek. Program ini memanggil metode-metode yang telah dibuat untuk mendemonstrasikan fungsionalitas dari setiap kelas secara berurutan.

5. **bonus.ts (Tugas Bonus)**
   File ini mengimplementasikan Sistem Informasi Akademik yang menggabungkan seluruh kelas (`Mahasiswa`, `Dosen`, `MataKuliah`) beserta kelas relasi tambahan `SistemInformasiAkademik`. Program ini dapat menambah, menyimpan, dan menampilkan daftar entitas serta jadwal perkuliahan.

## Screenshot Hasil Running

Hasil running telah disimpan ke dalam folder `screenshot/` dalam bentuk teks markdown:
- [Output Main Program](screenshot/ss-output-main.md)
- [Output Bonus Program](screenshot/ss-output-bonus.md)

## Kesulitan yang Dihadapi
- **Validasi Data**: Memastikan format NIM dan Email sesuai ketentuan membutuhkan implementasi Regex (Regular Expression) dan string manipulation.
- **Tipe Data**: Memastikan tipe data yang dikirim ke constructor sesuai dengan definisi atribut di dalam kelas.

## Kesimpulan
Melalui praktikum ini, saya telah memahami konsep pembuatan *class*, deklarasi atribut, penggunaan *constructor*, serta implementasi *methods* (baik biasa maupun statis) dalam bahasa ts (typeScript). Selain itu, implementasi validasi pada setter/methods membantu menjaga integritas data dalam paradigma Object-Oriented Programming (OOP). Tugas bonus juga memberikan pemahaman tentang bagaimana beberapa objek dapat saling berelasi di dalam sebuah sistem (Sistem Informasi Akademik).
