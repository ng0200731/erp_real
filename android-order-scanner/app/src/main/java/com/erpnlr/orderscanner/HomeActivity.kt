package com.erpnlr.orderscanner

import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton

class HomeActivity : AppCompatActivity() {

    private lateinit var btnScan: MaterialButton
    private lateinit var btnSearch: MaterialButton
    private lateinit var btnOrders: MaterialButton
    private lateinit var btnSettings: MaterialButton
    private lateinit var tvVersion: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_home)

        btnScan = findViewById(R.id.btnScan)
        btnSearch = findViewById(R.id.btnSearch)
        btnOrders = findViewById(R.id.btnOrders)
        btnSettings = findViewById(R.id.btnSettings)
        tvVersion = findViewById(R.id.tvVersion)

        // Set version from BuildConfig
        tvVersion.text = "Version ${BuildConfig.VERSION_NAME}"

        btnScan.setOnClickListener {
            startActivity(Intent(this, ScannerActivity::class.java))
        }

        btnSearch.setOnClickListener {
            startActivity(Intent(this, SearchActivity::class.java))
        }

        btnOrders.setOnClickListener {
            startActivity(Intent(this, OrdersListActivity::class.java))
        }

        btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }
}
