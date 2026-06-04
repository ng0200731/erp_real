package com.erpnlr.orderscanner

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.util.Log
import com.erpnlr.orderscanner.utils.Constants
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.erpnlr.orderscanner.adapters.OrderListAdapter
import com.erpnlr.orderscanner.api.ApiClient
import com.erpnlr.orderscanner.api.ApiService
import com.erpnlr.orderscanner.models.*
import com.google.android.material.chip.Chip
import com.google.android.material.chip.ChipGroup
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

class OrdersListActivity : AppCompatActivity() {

    private lateinit var recyclerOrders: RecyclerView
    private lateinit var progressBar: ProgressBar
    private lateinit var tvEmpty: TextView
    private lateinit var selectionBar: LinearLayout
    private lateinit var tvSelectedCount: TextView
    private lateinit var btnBulkDelete: com.google.android.material.button.MaterialButton
    private lateinit var btnBulkScanAction: com.google.android.material.button.MaterialButton
    private lateinit var btnExport: ImageButton
    private lateinit var btnBulkScan: ImageButton
    private lateinit var chipGroupStatus: ChipGroup

    private lateinit var adapter: OrderListAdapter
    private lateinit var apiService: ApiService
    private var allOrders: List<OrderListItem> = emptyList()
    private var currentStatusFilter: String? = null
    private var isMultiSelectMode = false

    companion object {
        private const val TAG = "OrdersListActivity"
        private const val REQUEST_BULK_SCAN = 100
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_orders_list)

        apiService = ApiClient.getApiService(this)

        initViews()
        setupRecyclerView()
        setupListeners()

        // Handle incoming QR data (bulk scan or cancel)
        val cancelQrData = intent.getStringExtra("cancel_qr_data")
        val bulkQrData = intent.getStringExtra("bulk_qr_data")

        loadOrders {
            if (cancelQrData != null) {
                handleCancelQr(cancelQrData)
            } else if (bulkQrData != null) {
                handleBulkQr(bulkQrData)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Refresh orders when returning from scan or other activity
        loadOrders()
    }

    private fun initViews() {
        recyclerOrders = findViewById(R.id.recyclerOrders)
        progressBar = findViewById(R.id.progressBar)
        tvEmpty = findViewById(R.id.tvEmpty)
        selectionBar = findViewById(R.id.selectionBar)
        tvSelectedCount = findViewById(R.id.tvSelectedCount)
        btnBulkDelete = findViewById(R.id.btnBulkDelete)
        btnBulkScanAction = findViewById(R.id.btnBulkScanAction)
        btnExport = findViewById(R.id.btnExport)
        btnBulkScan = findViewById(R.id.btnBulkScan)
        chipGroupStatus = findViewById(R.id.chipGroupStatus)

        findViewById<ImageButton>(R.id.btnBack).setOnClickListener {
            finish()
        }
    }

    private fun setupRecyclerView() {
        adapter = OrderListAdapter(
            onItemClick = { order -> viewOrder(order) },
            onDeleteClick = { order -> cancelSingleOrder(order) },
            onSelectionChanged = { count -> updateSelectionUI(count) },
            onEnterMultiSelect = { enterMultiSelectMode() },
            onExitMultiSelect = { exitMultiSelectMode() }
        )
        recyclerOrders.layoutManager = LinearLayoutManager(this)
        recyclerOrders.adapter = adapter
    }

    private fun setupListeners() {
        // Status filter chips
        chipGroupStatus.setOnCheckedStateChangeListener { group, checkedIds ->
            currentStatusFilter = when {
                checkedIds.contains(R.id.chipPending) -> "pending"
                checkedIds.contains(R.id.chipInProduction) -> "in-production"
                checkedIds.contains(R.id.chipCompleted) -> "completed"
                checkedIds.contains(R.id.chipCancelled) -> "cancelled"
                else -> null // All
            }
            applyFilter()
        }

        // Bulk delete
        btnBulkDelete.setOnClickListener {
            val selected = adapter.getSelectedOrders()
            if (selected.isEmpty()) return@setOnClickListener
            showBulkDeleteDialog(selected)
        }

        // Bulk scan action
        btnBulkScanAction.setOnClickListener {
            val selected = adapter.getSelectedOrders()
            if (selected.isEmpty()) return@setOnClickListener
            showDepartmentPickerDialog(selected)
        }

        // Export Excel
        btnExport.setOnClickListener {
            exportToExcel()
        }

        // Bulk scan (from toolbar - opens scanner to scan QR and update all selected)
        btnBulkScan.setOnClickListener {
            // Open scanner to scan a QR code and update all selected orders
            val intent = Intent(this, ScannerActivity::class.java)
            intent.putExtra("return_result", true)
            startActivityForResult(intent, REQUEST_BULK_SCAN)
        }
    }

    private fun loadOrders(onComplete: (() -> Unit)? = null) {
        progressBar.visibility = View.VISIBLE
        tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val response = apiService.getAllOrders()
                if (response.isSuccessful && response.body()?.success == true) {
                    allOrders = response.body()?.orders ?: emptyList()
                    applyFilter()
                } else {
                    showError("Failed to load orders")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading orders", e)
                showError("Error: ${e.message}")
            } finally {
                progressBar.visibility = View.GONE
                onComplete?.invoke()
            }
        }
    }

    private fun applyFilter() {
        val filtered = if (currentStatusFilter != null) {
            allOrders.filter { it.status == currentStatusFilter }
        } else {
            allOrders
        }
        adapter.setOrders(filtered)

        if (filtered.isEmpty()) {
            tvEmpty.visibility = View.VISIBLE
            recyclerOrders.visibility = View.GONE
        } else {
            tvEmpty.visibility = View.GONE
            recyclerOrders.visibility = View.VISIBLE
        }
    }

    private fun viewOrder(order: OrderListItem) {
        val intent = Intent(this, MainActivity::class.java)
        intent.putExtra(Constants.EXTRA_ORDER_SEQ, order.orderSeq)
        startActivity(intent)
    }

    private fun cancelSingleOrder(order: OrderListItem) {
        AlertDialog.Builder(this)
            .setTitle("Cancel Order")
            .setMessage("Cancel order ${order.orderSeq}?")
            .setPositiveButton("Cancel") { _, _ ->
                performCancel(listOf(order.id))
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun showBulkDeleteDialog(orders: List<OrderListItem>) {
        AlertDialog.Builder(this)
            .setTitle("Cancel Orders")
            .setMessage("Cancel ${orders.size} selected order(s)?")
            .setPositiveButton("Cancel") { _, _ ->
                performCancel(orders.map { it.id })
            }
            .setNegativeButton("No", null)
            .show()
    }

    private fun performCancel(orderIds: List<Int>) {
        lifecycleScope.launch {
            try {
                val response = apiService.bulkCancelOrders(BulkCancelRequest(orderIds))
                if (response.isSuccessful && response.body()?.success == true) {
                    Toast.makeText(this@OrdersListActivity, "Cancelled ${response.body()?.updatedCount} orders", Toast.LENGTH_SHORT).show()
                    exitMultiSelectMode()
                    loadOrders()
                } else {
                    Toast.makeText(this@OrdersListActivity, "Failed: ${response.body()?.error}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@OrdersListActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showDepartmentPickerDialog(orders: List<OrderListItem>) {
        val departments = arrayOf("CS Team", "PMC", "Material", "Production", "Cut and Fold", "QC", "Shipment", "Account")
        AlertDialog.Builder(this)
            .setTitle("Select Department")
            .setItems(departments) { _, which ->
                val department = departments[which]
                performBulkScanUpdate(orders.map { it.id }, department)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun performBulkScanUpdate(orderIds: List<Int>, department: String) {
        lifecycleScope.launch {
            progressBar.visibility = View.VISIBLE
            try {
                val response = apiService.bulkScanUpdate(BulkScanUpdateRequest(orderIds, department))
                if (response.isSuccessful && response.body()?.success == true) {
                    val body = response.body()!!
                    Toast.makeText(this@OrdersListActivity, "Updated ${body.updatedCount} orders", Toast.LENGTH_SHORT).show()
                    if (!body.errors.isNullOrEmpty()) {
                        val errorMsg = body.errors.joinToString("\n") { "${it.orderSeq ?: it.orderId}: ${it.error}" }
                        AlertDialog.Builder(this@OrdersListActivity)
                            .setTitle("Some Errors")
                            .setMessage(errorMsg)
                            .setPositiveButton("OK", null)
                            .show()
                    }
                    exitMultiSelectMode()
                    loadOrders()
                } else {
                    Toast.makeText(this@OrdersListActivity, "Failed: ${response.body()?.error}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@OrdersListActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun enterMultiSelectMode() {
        isMultiSelectMode = true
        selectionBar.visibility = View.VISIBLE
        adapter.setMultiSelectMode(true)
        btnBulkScan.visibility = View.VISIBLE
    }

    private fun exitMultiSelectMode() {
        isMultiSelectMode = false
        selectionBar.visibility = View.GONE
        adapter.setMultiSelectMode(false)
        adapter.clearSelection()
        btnBulkScan.visibility = View.GONE
    }

    private fun updateSelectionUI(count: Int) {
        tvSelectedCount.text = "$count selected"
        if (count == 0 && isMultiSelectMode) {
            exitMultiSelectMode()
        }
    }

    private fun exportToExcel() {
        lifecycleScope.launch {
            progressBar.visibility = View.VISIBLE
            try {
                val baseUrl = ApiClient.getBaseUrl(this@OrdersListActivity)
                val statusParam = currentStatusFilter ?: ""
                val url = "${baseUrl}api/orders/export-excel?status=$statusParam"

                val response = apiService.downloadFile(url)
                if (response.isSuccessful && response.body() != null) {
                    saveAndShareExcel(response.body()!!)
                } else {
                    Toast.makeText(this@OrdersListActivity, "Export failed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Export error", e)
                Toast.makeText(this@OrdersListActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            } finally {
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun saveAndShareExcel(body: ResponseBody) {
        try {
            val fileName = "orders-${java.time.LocalDate.now()}.xlsx"
            val file = File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), fileName)

            FileOutputStream(file).use { output ->
                body.byteStream().use { input ->
                    input.copyTo(output)
                }
            }

            val uri = FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )

            val shareIntent = Intent(Intent.ACTION_SEND)
            shareIntent.type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri)
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            startActivity(Intent.createChooser(shareIntent, "Export Orders"))

        } catch (e: IOException) {
            Log.e(TAG, "Save error", e)
            Toast.makeText(this, "Failed to save file", Toast.LENGTH_SHORT).show()
        }
    }

    // Handle bulk QR scan result
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQUEST_BULK_SCAN && resultCode == RESULT_OK && data != null) {
            val scannedCode = data.getStringExtra(Constants.EXTRA_SCANNED_CODE) ?: return
            handleBulkQrScan(scannedCode)
        }
    }

    private fun handleBulkQrScan(scannedCode: String) {
        // Try to parse as bulk QR JSON
        try {
            val bulkData = com.google.gson.Gson().fromJson(scannedCode, BulkQrData::class.java)
            if (bulkData.type == "bulk" && bulkData.poNumbers != null) {
                // Show PO#s included in bulk QR
                AlertDialog.Builder(this)
                    .setTitle("Bulk QR - ${bulkData.count} PO#s")
                    .setMessage("PO#s:\n${bulkData.poNumbers.joinToString("\n")}")
                    .setPositiveButton("Mass Update") { _, _ ->
                        // Find order IDs by PO#s
                        val orderIds = allOrders
                            .filter { bulkData.poNumbers.contains(it.orderSeq) }
                            .map { it.id }
                        if (orderIds.isNotEmpty()) {
                            showDepartmentPickerDialog(allOrders.filter { bulkData.poNumbers.contains(it.orderSeq) })
                        } else {
                            Toast.makeText(this, "No matching orders found", Toast.LENGTH_SHORT).show()
                        }
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
                return
            }
        } catch (e: Exception) {
            // Not JSON, treat as single PO#
        }

        // Single PO# scan - update selected orders with scanned department info
        // Or if we're in multi-select mode, treat as: "update all selected to this order's department"
        val selectedOrders = adapter.getSelectedOrders()
        if (selectedOrders.isNotEmpty()) {
            // Find the scanned order to get its department
            lifecycleScope.launch {
                try {
                    val response = apiService.getOrderBySeq(scannedCode)
                    if (response.isSuccessful && response.body()?.order != null) {
                        val scannedOrder = response.body()?.order!!
                        val dept = scannedOrder.currentDepartment
                        if (dept != null) {
                            AlertDialog.Builder(this@OrdersListActivity)
                                .setTitle("Update to Department")
                                .setMessage("Update ${selectedOrders.size} selected orders to '$dept'?")
                                .setPositiveButton("Update") { _, _ ->
                                    performBulkScanUpdate(selectedOrders.map { it.id }, dept)
                                }
                                .setNegativeButton("Cancel", null)
                                .show()
                        } else {
                            Toast.makeText(this@OrdersListActivity, "Scanned order has no department", Toast.LENGTH_SHORT).show()
                        }
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@OrdersListActivity, "Error fetching scanned order", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // Handle cancel QR scanned from web (red QR for cancelled POs)
    private fun handleCancelQr(qrData: String) {
        try {
            val bulkData = com.google.gson.Gson().fromJson(qrData, BulkQrData::class.java)
            val poNumbers = bulkData.poNumbers ?: return

            val ordersToCancel = allOrders.filter { poNumbers.contains(it.orderSeq) }

            if (ordersToCancel.isEmpty()) {
                Toast.makeText(this, "No matching orders found", Toast.LENGTH_SHORT).show()
                return
            }

            AlertDialog.Builder(this)
                .setTitle("Cancel ${ordersToCancel.size} PO#s")
                .setMessage("PO#s:\n${ordersToCancel.map { it.orderSeq }.joinToString("\n")}\n\nCancel all these orders?")
                .setPositiveButton("Cancel Orders") { _, _ ->
                    performCancel(ordersToCancel.map { it.id })
                }
                .setNegativeButton("No", null)
                .show()
        } catch (e: Exception) {
            Toast.makeText(this, "Invalid cancel QR code", Toast.LENGTH_SHORT).show()
        }
    }

    // Handle bulk QR data from intent
    private fun handleBulkQr(qrData: String) {
        try {
            val bulkData = com.google.gson.Gson().fromJson(qrData, BulkQrData::class.java)
            val poNumbers = bulkData.poNumbers ?: return

            val matchingOrders = allOrders.filter { poNumbers.contains(it.orderSeq) }
            if (matchingOrders.isEmpty()) {
                Toast.makeText(this, "No matching orders found", Toast.LENGTH_SHORT).show()
                return
            }

            AlertDialog.Builder(this)
                .setTitle("Bulk QR - ${matchingOrders.size} PO#s")
                .setMessage("PO#s:\n${matchingOrders.map { it.orderSeq }.joinToString("\n")}")
                .setPositiveButton("Mass Update") { _, _ ->
                    showDepartmentPickerDialog(matchingOrders)
                }
                .setNegativeButton("Cancel", null)
                .show()
        } catch (e: Exception) {
            Toast.makeText(this, "Invalid bulk QR code", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showError(message: String) {
        tvEmpty.text = message
        tvEmpty.visibility = View.VISIBLE
        recyclerOrders.visibility = View.GONE
    }
}