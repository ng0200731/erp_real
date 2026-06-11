package com.erpnlr.orderscanner

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.erpnlr.orderscanner.api.ApiClient
import com.erpnlr.orderscanner.models.QuotationDetail
import com.erpnlr.orderscanner.models.StatusHistoryEntry
import com.erpnlr.orderscanner.models.SupplierInfo
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class QuotationDetailActivity : AppCompatActivity() {

    private lateinit var btnBack: ImageButton
    private lateinit var tvTitle: TextView
    private lateinit var progressBar: ProgressBar
    private lateinit var tvError: TextView
    private lateinit var tvSeq: TextView
    private lateinit var tvCustomerName: TextView
    private lateinit var tvItemName: TextView
    private lateinit var tvStatus: TextView
    private lateinit var tvDetails: TextView
    private lateinit var cardSuppliers: MaterialCardView
    private lateinit var tvSuppliers: TextView
    private lateinit var historyTable: TableLayout
    private lateinit var btnScanAgain: MaterialButton

    private var quotationId: Int = 0
    private var quotationType: String = "quotation"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_quotation_detail)

        quotationId = intent.getIntExtra("QUOTATION_ID", 0)
        quotationType = intent.getStringExtra("QUOTATION_TYPE") ?: "quotation"

        btnBack = findViewById(R.id.btnBack)
        tvTitle = findViewById(R.id.tvTitle)
        progressBar = findViewById(R.id.progressBar)
        tvError = findViewById(R.id.tvError)
        tvSeq = findViewById(R.id.tvSeq)
        tvCustomerName = findViewById(R.id.tvCustomerName)
        tvItemName = findViewById(R.id.tvItemName)
        tvStatus = findViewById(R.id.tvStatus)
        tvDetails = findViewById(R.id.tvDetails)
        cardSuppliers = findViewById(R.id.cardSuppliers)
        tvSuppliers = findViewById(R.id.tvSuppliers)
        historyTable = findViewById(R.id.historyTable)
        btnScanAgain = findViewById(R.id.btnScanAgain)

        tvTitle.text = if (quotationType == "outsourcing") "Outsourcing Details" else "Quotation Details"

        btnBack.setOnClickListener { finish() }
        btnScanAgain.setOnClickListener {
            startActivity(Intent(this, ScannerActivity::class.java))
            finish()
        }

        loadQuotationDetails()
    }

    private fun loadQuotationDetails() {
        progressBar.visibility = View.VISIBLE
        tvError.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val apiService = ApiClient.getApiService(this@QuotationDetailActivity)
                val response = apiService.getQuotationByQrId(quotationId)

                progressBar.visibility = View.GONE

                if (response.isSuccessful) {
                    val body = response.body()
                    if (body?.success == true && body.quotation != null) {
                        displayQuotation(body.quotation, body.history ?: emptyList(), body.suppliers ?: emptyList())
                    } else {
                        showError("Quotation not found")
                    }
                } else {
                    showError("Server error: ${response.code()}")
                }
            } catch (e: Exception) {
                progressBar.visibility = View.GONE
                showError("Network error: ${e.message}")
            }
        }
    }

    private fun displayQuotation(q: QuotationDetail, history: List<StatusHistoryEntry>, suppliers: List<SupplierInfo>) {
        // Seq / OS Ref
        val seqLabel = if (quotationType == "outsourcing") q.outsourcingSeq else q.quotationSeq
        tvSeq.text = seqLabel ?: "#$quotationId"

        // Customer
        tvCustomerName.text = q.customerName ?: "—"
        tvItemName.text = q.customerItemName ?: "—"

        // Status
        tvStatus.text = (q.status ?: "draft").replaceFirstChar { it.uppercase() }

        // Details
        val details = buildString {
            appendLine("Contact: ${q.contactPerson ?: "N/A"}")
            appendLine("Email: ${q.email ?: "N/A"}")
            appendLine("Phone: ${q.phone ?: "N/A"}")
            appendLine("Product Type: ${q.productType ?: "N/A"}")
            appendLine("Quantity: ${q.quantity?.toLocaleString() ?: "N/A"}")
            appendLine("Total: HKD ${q.total?.format(2) ?: "N/A"}")
            appendLine("Type: ${q.type ?: "N/A"}")
            append("Date: ${formatDate(q.dateCreated)}")
        }
        tvDetails.text = details

        // Suppliers (outsourcing only)
        if (quotationType == "outsourcing" && suppliers.isNotEmpty()) {
            cardSuppliers.visibility = View.VISIBLE
            val suppliersText = suppliers.joinToString("\n\n") { supplier ->
                val members = supplier.members?.joinToString(", ") { m ->
                    m.name ?: ""
                }?.takeIf { it.isNotBlank() } ?: "No members"
                "${supplier.companyName}\n  Members: $members"
            }
            tvSuppliers.text = suppliersText
        }

        // History
        displayHistory(history)
    }

    private fun displayHistory(history: List<StatusHistoryEntry>) {
        historyTable.removeAllViews()

        // Header row
        val headerRow = TableRow(this).apply {
            layoutParams = TableLayout.LayoutParams(TableLayout.LayoutParams.MATCH_PARENT, TableLayout.LayoutParams.WRAP_CONTENT)
            setPadding(0, 8, 0, 8)
        }
        headerRow.addView(makeTextView("Date", true, 0.3f))
        headerRow.addView(makeTextView("From", true, 0.3f))
        headerRow.addView(makeTextView("To", true, 0.3f))
        historyTable.addView(headerRow)

        if (history.isEmpty()) {
            val emptyRow = TableRow(this)
            emptyRow.addView(makeTextView("No history available", false, 1f, colspan = 3))
            historyTable.addView(emptyRow)
            return
        }

        for (entry in history) {
            val row = TableRow(this).apply {
                setPadding(0, 4, 0, 4)
            }
            row.addView(makeTextView(formatDate(entry.changedAt), false, 0.3f))
            row.addView(makeTextView(entry.fromStatus ?: "—", false, 0.3f))
            row.addView(makeTextView(entry.toStatus ?: "—", false, 0.3f))
            historyTable.addView(row)
        }
    }

    private fun makeTextView(text: String, isBold: Boolean, weight: Float, colspan: Int = 1): TextView {
        return TextView(this).apply {
            this.text = text
            this.setTextSize(13f)
            setTextColor(resources.getColor(if (isBold) R.color.text_primary else R.color.text_secondary, null))
            if (isBold) setTypeface(null, android.graphics.Typeface.BOLD)
            layoutParams = TableRow.LayoutParams(0, TableRow.LayoutParams.WRAP_CONTENT, weight).apply {
                if (colspan > 1) this.span = colspan
                setPadding(4, 4, 4, 4)
            }
        }
    }

    private fun formatDate(dateStr: String?): String {
        if (dateStr.isNullOrBlank()) return "N/A"
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            val outputFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())
            val date = inputFormat.parse(dateStr)
            date?.let { outputFormat.format(it) } ?: dateStr
        } catch (e: Exception) {
            dateStr.take(19)
        }
    }

    private fun showError(message: String) {
        tvError.text = message
        tvError.visibility = View.VISIBLE
    }

    private fun Int?.toLocaleString(): String = this?.let { String.format("%,d", it) } ?: "N/A"

    private fun Double?.format(decimals: Int): String = this?.let { String.format("%.${decimals}f", it) } ?: "0.00"
}
