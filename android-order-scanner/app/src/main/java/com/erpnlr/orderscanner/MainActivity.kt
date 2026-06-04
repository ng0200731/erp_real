package com.erpnlr.orderscanner

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.erpnlr.orderscanner.api.ApiClient
import com.erpnlr.orderscanner.models.ScanRequest
import com.erpnlr.orderscanner.models.ScanResponse
import com.erpnlr.orderscanner.utils.Constants
import com.erpnlr.orderscanner.utils.DepartmentColors
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {

    private lateinit var tvOrderSeq: TextView
    private lateinit var tvPresentDepartment: TextView
    private lateinit var tvOrderInfo: TextView
    private lateinit var spinnerDepartment: Spinner
    private lateinit var etNotes: EditText
    private lateinit var btnSave: MaterialButton
    private lateinit var btnScanAgain: MaterialButton
    private lateinit var progressBar: ProgressBar

    private var orderSeq: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        initViews()
        setupDepartmentSpinner()

        // QR code contains PO# only (plain text)
        orderSeq = intent.getStringExtra(Constants.EXTRA_ORDER_SEQ) ?: ""
        tvOrderSeq.text = "PO# $orderSeq"

        if (orderSeq.isEmpty()) {
            Toast.makeText(this, getString(R.string.error_invalid_qr), Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        setupClickListeners()
        fetchOrderDetails()
    }

    private fun initViews() {
        tvOrderSeq = findViewById(R.id.tvPoNumber)
        tvPresentDepartment = findViewById(R.id.tvPresentDepartment)
        tvOrderInfo = TextView(this).apply {
            id = View.generateViewId()
            setPadding(0, 16, 0, 16)
            textSize = 13f
            setTextColor(Color.parseColor("#212121"))
        }
        spinnerDepartment = findViewById(R.id.spinnerDepartment)
        etNotes = findViewById(R.id.etNotes)
        btnSave = findViewById(R.id.btnSave)
        btnScanAgain = findViewById(R.id.btnScanAgain)
        progressBar = findViewById(R.id.progressBar)

        // Add order info view below present department
        val parent = tvPresentDepartment.parent as? LinearLayout
        parent?.addView(tvOrderInfo, parent.indexOfChild(tvPresentDepartment) + 1)
    }

    private fun setupDepartmentSpinner() {
        val adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_item,
            Constants.DEPARTMENTS
        )
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        spinnerDepartment.adapter = adapter
    }

    private fun setupClickListeners() {
        btnSave.setOnClickListener { saveScan() }
        btnScanAgain.setOnClickListener { finish() }
    }

    private fun fetchOrderDetails() {
        if (!isNetworkAvailable()) {
            tvPresentDepartment.text = "Unable to check - no network"
            tvPresentDepartment.visibility = View.VISIBLE
            return
        }

        lifecycleScope.launch {
            try {
                // Fetch full order details
                val detailResponse = ApiClient.getApiService(this@MainActivity).getOrderBySeq(orderSeq)

                if (detailResponse.isSuccessful) {
                    val order = detailResponse.body()?.order
                    if (order != null) {
                        runOnUiThread {
                            // Show order info
                            val info = buildString {
                                append("Customer: ${order.customerName}\n")
                                append("Ref: ${order.quotationSeq ?: "-"}\n")
                                append("Item: ${order.customerItemName ?: "-"}\n")
                                append("Product: ${order.productType}\n")
                                append("Qty: ${order.quantity}\n")
                                append("Factory: ${order.workshopName ?: "Not assigned"}\n")
                                append("Status: ${order.status}")
                            }
                            tvOrderInfo.text = info
                            tvOrderInfo.visibility = View.VISIBLE

                            // Show progress
                            val progressMap = mutableMapOf<String, String>()
                            val history: List<com.erpnlr.orderscanner.models.ProgressScan>? = order.progressHistory
                            if (history != null) {
                                for (scan in history) {
                                    progressMap[scan.department] = scan.scannedAt
                                }
                            }
                            val progressText = buildString {
                                append("\nProgress:\n")
                                Constants.DEPARTMENTS.forEach { dept ->
                                    val done = progressMap.containsKey(dept)
                                    append(if (done) "✓ " else "○ ")
                                    append(dept)
                                    append("\n")
                                }
                            }
                            tvOrderInfo.append(progressText)

                            // Present department
                            if (order.currentDepartment != null) {
                                tvPresentDepartment.text = "Present: ${order.currentDepartment}"
                            } else {
                                tvPresentDepartment.text = "Present: None (Start with CS Team)"
                            }
                            tvPresentDepartment.visibility = View.VISIBLE
                        }
                    } else {
                        showNoHistory()
                    }
                } else {
                    // Fallback to last scan
                    fetchLastScanOnly()
                }
            } catch (e: Exception) {
                fetchLastScanOnly()
            }
        }
    }

    private fun fetchLastScanOnly() {
        lifecycleScope.launch {
            try {
                val response = ApiClient.getApiService(this@MainActivity).getLastScan(orderSeq)
                if (response.isSuccessful) {
                    val body = response.body()
                    runOnUiThread {
                        if (body?.lastScan != null) {
                            tvPresentDepartment.text = "Present: ${body.lastScan.department}"
                        } else {
                            tvPresentDepartment.text = "Present: None (Start with CS Team)"
                        }
                        tvPresentDepartment.visibility = View.VISIBLE
                    }
                } else {
                    showNoHistory()
                }
            } catch (e: Exception) {
                runOnUiThread {
                    tvPresentDepartment.text = "Unable to check"
                    tvPresentDepartment.visibility = View.VISIBLE
                }
            }
        }
    }

    private fun showNoHistory() {
        runOnUiThread {
            tvPresentDepartment.text = "Present: None (Start with CS Team)"
            tvPresentDepartment.visibility = View.VISIBLE
        }
    }

    private fun saveScan() {
        if (spinnerDepartment.selectedItemPosition == -1) {
            Toast.makeText(this, getString(R.string.error_no_department), Toast.LENGTH_SHORT).show()
            return
        }

        if (!isNetworkAvailable()) {
            Toast.makeText(this, getString(R.string.error_network), Toast.LENGTH_LONG).show()
            return
        }

        val department = spinnerDepartment.selectedItem.toString()
        val notes = etNotes.text.toString().trim().ifEmpty { null }

        val request = ScanRequest(orderSeq = orderSeq, department = department, notes = notes)

        setLoading(true)

        lifecycleScope.launch {
            try {
                val response = ApiClient.getApiService(this@MainActivity).recordScan(request)

                if (response.isSuccessful && response.body()?.success == true) {
                    runOnUiThread {
                        setLoading(false)
                        Toast.makeText(this@MainActivity, getString(R.string.success_saved), Toast.LENGTH_SHORT).show()
                        clearForm()
                        // Refresh order details to show updated status, then finish
                        fetchOrderDetails()
                        tvOrderSeq.postDelayed({ finish() }, 2000)
                    }
                } else {
                    val errorBody = if (response.isSuccessful) {
                        response.body()
                    } else {
                        try {
                            val errorJson = response.errorBody()?.string()
                            if (errorJson != null) {
                                com.google.gson.Gson().fromJson(errorJson, ScanResponse::class.java)
                            } else null
                        } catch (e: Exception) { null }
                    }

                    val errorMessage = when {
                        errorBody?.error != null -> {
                            val isSeqError = errorBody.error.contains("Cannot go back") ||
                                    errorBody.error.contains("Cannot skip") ||
                                    errorBody.error.contains("repeat department") ||
                                    errorBody.error.contains("First scan must")
                            if (isSeqError) {
                                if (errorBody.nextExpected != null) "Wrong sequence. Next: ${errorBody.nextExpected}"
                                else "Wrong progress sequence"
                            } else errorBody.error
                        }
                        else -> getString(R.string.error_server)
                    }

                    runOnUiThread {
                        setLoading(false)
                        Toast.makeText(this@MainActivity, errorMessage, Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    setLoading(false)
                    Toast.makeText(this@MainActivity, getString(R.string.error_network), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun setLoading(loading: Boolean) {
        progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        btnSave.isEnabled = !loading
        btnScanAgain.isEnabled = !loading
        spinnerDepartment.isEnabled = !loading
        etNotes.isEnabled = !loading
    }

    private fun clearForm() {
        spinnerDepartment.setSelection(0)
        etNotes.text.clear()
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }
}
