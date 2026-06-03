package com.erpnlr.orderscanner

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.erpnlr.orderscanner.api.ApiClient
import com.erpnlr.orderscanner.models.ProgressHistoryItem
import com.erpnlr.orderscanner.utils.Constants
import com.erpnlr.orderscanner.utils.DepartmentColors
import com.google.android.material.button.MaterialButton
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

class ProgressHistoryActivity : AppCompatActivity() {

    private lateinit var btnBack: ImageButton
    private lateinit var btnRefresh: MaterialButton
    private lateinit var tvTitle: TextView
    private lateinit var tvOrderSeq: TextView
    private lateinit var tableLayout: TableLayout
    private lateinit var progressBar: ProgressBar

    private var orderSeq: String = ""
    private val handler = Handler(Looper.getMainLooper())
    private var autoRefreshRunnable: Runnable? = null

    companion object {
        private const val TAG = "ProgressHistoryActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        try {
            Log.d(TAG, "onCreate started")
            setContentView(R.layout.activity_progress_history)

            orderSeq = intent.getStringExtra(Constants.EXTRA_ORDER_SEQ) ?: ""
            Log.d(TAG, "Order Seq: $orderSeq")

            if (orderSeq.isEmpty()) {
                Toast.makeText(this, "Invalid Order number", Toast.LENGTH_SHORT).show()
                finish()
                return
            }

            initViews()
            setupClickListeners()
            loadProgressHistory()
            startAutoRefresh()

            Log.d(TAG, "onCreate completed successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error in onCreate", e)
            Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private fun initViews() {
        try {
            btnBack = findViewById(R.id.btnBack)
            btnRefresh = findViewById(R.id.btnRefresh)
            tvTitle = findViewById(R.id.tvTitle)
            tvOrderSeq = findViewById(R.id.tvPoNumber)
            tableLayout = findViewById(R.id.tableLayout)
            progressBar = findViewById(R.id.progressBar)

            tvTitle.text = "Progress History"
            tvOrderSeq.text = "Order $orderSeq"

            Log.d(TAG, "Views initialized successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing views", e)
            throw e
        }
    }

    private fun setupClickListeners() {
        btnBack.setOnClickListener {
            finish()
        }

        btnRefresh.setOnClickListener {
            loadProgressHistory()
        }
    }

    private fun loadProgressHistory() {
        Log.d(TAG, "Loading progress history for Order: $orderSeq")
        progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            try {
                val response = ApiClient.getApiService(this@ProgressHistoryActivity).getProgressHistory(orderSeq)
                Log.d(TAG, "API response code: ${response.code()}")

                if (response.isSuccessful) {
                    val body = response.body()
                    Log.d(TAG, "Progress items count: ${body?.progress?.size ?: 0}")

                    val scannedMap = mutableMapOf<String, ProgressHistoryItem>()

                    body?.progress?.forEach { scan ->
                        scannedMap[scan.department] = ProgressHistoryItem(
                            department = scan.department,
                            scannedAt = scan.scannedAt,
                            notes = scan.notes,
                            isScanned = true
                        )
                    }

                    val allItems = Constants.DEPARTMENTS.map { dept ->
                        scannedMap[dept] ?: ProgressHistoryItem(
                            department = dept,
                            scannedAt = null,
                            notes = null,
                            isScanned = false
                        )
                    }

                    runOnUiThread {
                        progressBar.visibility = View.GONE
                        populateTable(allItems)
                    }
                } else {
                    Log.e(TAG, "API error: ${response.code()} - ${response.message()}")
                    runOnUiThread {
                        progressBar.visibility = View.GONE
                        Toast.makeText(this@ProgressHistoryActivity, "Failed to load history: ${response.code()}", Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Network error", e)
                runOnUiThread {
                    progressBar.visibility = View.GONE
                    Toast.makeText(this@ProgressHistoryActivity, "Network error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun populateTable(items: List<ProgressHistoryItem>) {
        try {
            Log.d(TAG, "Populating table with ${items.size} items")

            val childCount = tableLayout.childCount
            if (childCount > 1) {
                tableLayout.removeViews(1, childCount - 1)
            }

            items.forEachIndexed { index, item ->
                val row = TableRow(this)
                row.layoutParams = TableLayout.LayoutParams(
                    TableLayout.LayoutParams.MATCH_PARENT,
                    TableLayout.LayoutParams.WRAP_CONTENT
                )

                val deptBadge = TextView(this).apply {
                    text = item.department
                    setPadding(16, 10, 16, 10)
                    setTextColor(Color.WHITE)
                    textSize = 11f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    gravity = Gravity.CENTER

                    val color = if (item.isScanned) {
                        DepartmentColors.getColor(item.department)
                    } else {
                        "#999999"
                    }

                    val drawable = GradientDrawable()
                    drawable.setColor(Color.parseColor(color))
                    drawable.cornerRadius = 6f
                    background = drawable
                }

                val deptContainer = FrameLayout(this).apply {
                    setPadding(12, 12, 12, 12)
                    layoutParams = TableRow.LayoutParams(
                        0,
                        TableRow.LayoutParams.WRAP_CONTENT,
                        1f
                    )
                    addView(deptBadge)
                }

                val timeCell = TextView(this).apply {
                    text = if (item.isScanned && item.scannedAt != null) {
                        formatTimestamp(item.scannedAt)
                    } else {
                        "---"
                    }
                    setPadding(12, 12, 12, 12)
                    setTextColor(Color.parseColor("#212121"))
                    textSize = 13f
                    layoutParams = TableRow.LayoutParams(
                        0,
                        TableRow.LayoutParams.WRAP_CONTENT,
                        1.2f
                    )
                }

                val notesCell = TextView(this).apply {
                    text = item.notes ?: "-"
                    setPadding(12, 12, 12, 12)
                    setTextColor(Color.parseColor("#212121"))
                    textSize = 13f
                    layoutParams = TableRow.LayoutParams(
                        0,
                        TableRow.LayoutParams.WRAP_CONTENT,
                        1.2f
                    )
                }

                row.addView(deptContainer)
                row.addView(timeCell)
                row.addView(notesCell)

                val bgColor = if (index % 2 == 0) Color.WHITE else Color.parseColor("#FAFAFA")
                row.setBackgroundColor(bgColor)

                tableLayout.addView(row)
            }

            Log.d(TAG, "Table populated successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Error populating table", e)
            Toast.makeText(this, "Error displaying data: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun formatTimestamp(timestamp: String): String {
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            inputFormat.timeZone = TimeZone.getTimeZone("UTC")
            val date = inputFormat.parse(timestamp)

            val outputFormat = SimpleDateFormat("yyyy/M/d HH:mm:ss", Locale.getDefault())
            date?.let { outputFormat.format(it) } ?: "---"
        } catch (e: Exception) {
            Log.e(TAG, "Error formatting timestamp: $timestamp", e)
            timestamp
        }
    }

    private fun startAutoRefresh() {
        autoRefreshRunnable = object : Runnable {
            override fun run() {
                loadProgressHistory()
                handler.postDelayed(this, 5000)
            }
        }
        handler.postDelayed(autoRefreshRunnable!!, 5000)
    }

    override fun onDestroy() {
        super.onDestroy()
        autoRefreshRunnable?.let { handler.removeCallbacks(it) }
    }
}
