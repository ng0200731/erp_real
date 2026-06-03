package com.erpnlr.orderscanner

import android.content.Intent
import android.os.Bundle
import android.widget.ImageButton
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.erpnlr.orderscanner.utils.Constants
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText

class SearchActivity : AppCompatActivity() {

    private lateinit var etOrderSeq: TextInputEditText
    private lateinit var btnSearch: MaterialButton
    private lateinit var btnScan: MaterialButton
    private lateinit var btnBack: ImageButton

    private val scanLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == RESULT_OK) {
            val scannedCode = result.data?.getStringExtra(Constants.EXTRA_SCANNED_CODE)
            if (!scannedCode.isNullOrEmpty()) {
                etOrderSeq.setText(scannedCode)
                searchOrder(scannedCode)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_search)

        etOrderSeq = findViewById(R.id.etPoNumber)
        btnSearch = findViewById(R.id.btnSearch)
        btnScan = findViewById(R.id.btnScan)
        btnBack = findViewById(R.id.btnBack)

        btnBack.setOnClickListener {
            finish()
        }

        btnScan.setOnClickListener {
            val intent = Intent(this, ScannerActivity::class.java).apply {
                putExtra("return_result", true)
            }
            scanLauncher.launch(intent)
        }

        btnSearch.setOnClickListener {
            val seq = etOrderSeq.text.toString().trim()

            if (seq.isEmpty()) {
                Toast.makeText(this, "Please enter an Order number", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            searchOrder(seq)
        }
    }

    private fun searchOrder(orderSeq: String) {
        val intent = Intent(this, ProgressHistoryActivity::class.java).apply {
            putExtra(Constants.EXTRA_ORDER_SEQ, orderSeq)
        }
        startActivity(intent)
    }
}
